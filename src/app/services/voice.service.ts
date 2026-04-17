import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { VoiceStatus, VoiceTranscript, VoiceSession } from './voice.model';

const WS_PORT = 18790;
const RECONNECT_INTERVAL = 3000;

@Injectable({
  providedIn: 'root',
})
export class VoiceService {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  /** True when connected to voice server over Tailscale (not localhost) */
  browserAudio = false;

  // Audio playback (browser mode)
  private audioCtx: AudioContext | null = null;
  private audioQueue: AudioBuffer[] = [];
  private currentSource: AudioBufferSourceNode | null = null;
  private nextPlayTime = 0;

  // Browser mic capture
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private micAudioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxRecordTimer: ReturnType<typeof setTimeout> | null = null;
  private peakRms = 0;
  private discardRecording = false;  // true when stop is user-initiated
  private autoListenRestartTimer: ReturnType<typeof setTimeout> | null = null;

  private currentAgentId: string | null = null;

  connected$ = new BehaviorSubject<boolean>(false);
  status$ = new BehaviorSubject<VoiceStatus>('idle');
  session$ = new BehaviorSubject<VoiceSession | null>(null);
  autoListen$ = new BehaviorSubject<boolean>(false);
  transcript$ = new Subject<VoiceTranscript>();
  transcriptHistory$ = new Subject<VoiceTranscript[]>();
  info$ = new Subject<string>();

  constructor(private zone: NgZone) {
    this.browserAudio = typeof window !== 'undefined'
      && window.location.hostname !== 'localhost'
      && window.location.hostname !== '127.0.0.1';
  }

  connect(agentId: string = 'shadow'): void {
    // If switching agents, disconnect first
    if (this.currentAgentId && this.currentAgentId !== agentId && this.ws) {
      this.disconnect();
    }
    this.currentAgentId = agentId;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionalClose = false;

    // Build WS URL: use current hostname (works for both localhost and Tailscale)
    const host = window.location.hostname || 'localhost';
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${host}:${WS_PORT}/ws/${agentId}`;

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.zone.run(() => this.connected$.next(true));
      // Tell server what mode we're in
      if (this.browserAudio) {
        this.send({ cmd: 'init', mode: 'browser_audio' });
      }
    };

    this.ws.onclose = () => {
      this.zone.run(() => {
        this.connected$.next(false);
        this.status$.next('idle');
      });
      this.ws = null;
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };

    this.ws.onmessage = (event) => {
      // Binary message = WAV audio chunk from server
      if (event.data instanceof ArrayBuffer) {
        this.handleAudioChunk(event.data);
        return;
      }

      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      this.zone.run(() => {
        switch (data.type) {
          case 'status':
            this.status$.next(data.state as VoiceStatus);
            break;
          case 'transcript':
            this.transcript$.next({
              role: data.role,
              text: data.text,
              timestamp: new Date(),
            });
            break;
          case 'session':
            this.session$.next({
              id: data.id,
              name: data.name,
              backend: data.backend,
            });
            break;
          case 'config':
            if (data.auto_listen !== undefined) {
              this.autoListen$.next(data.auto_listen);
            }
            break;
          case 'info':
            this.info$.next(data.text);
            break;
          case 'audio_start':
            this.resetAudioQueue();
            break;
          case 'audio_end':
            // Audio chunks already queued and playing
            break;
          case 'transcript_history':
            if (data.messages && Array.isArray(data.messages)) {
              this.transcriptHistory$.next(
                data.messages.map((m: any) => ({
                  role: m.role,
                  text: m.text,
                  timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
                })),
              );
            }
            break;
          case 'auto_listen_trigger':
            // Server wants us to start browser mic capture (auto-listen)
            if (this.browserAudio) {
              this.clearAutoListenRestart();
              this.autoListenRestartTimer = setTimeout(() => {
                this.autoListenRestartTimer = null;
                this.startBrowserListening();
              }, 500);
            }
            break;
          case 'stop_listening':
            this.stopBrowserListening();
            break;
        }
      });
    };
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearAutoListenRestart();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stopAudio();
    this.stopBrowserListening();
  }

  sendText(text: string): void {
    this.stopBrowserListening();
    this.send({ cmd: 'send_text', text });
  }

  startListening(): void {
    this.send({ cmd: 'start_listening' });
  }

  stop(): void {
    this.clearAutoListenRestart();
    this.send({ cmd: 'stop' });
    this.stopAudio();
    this.stopBrowserListening();
    this.zone.run(() => this.status$.next('idle'));
  }

  setAutoListen(enabled: boolean): void {
    this.send({ cmd: 'set_auto_listen', enabled });
  }

  setMute(muted: boolean): void {
    this.send({ cmd: 'set_mute', muted });
  }

  // ── Browser Audio Playback ──────────────────────────────────────

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext({ sampleRate: 24000 });
    }
    return this.audioCtx;
  }

  /** Call during a user gesture so AudioContext is already running when audio arrives. */
  async primeAudio(): Promise<void> {
    if (!this.browserAudio) return;
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  private resetAudioQueue(): void {
    this.audioQueue = [];
    this.nextPlayTime = 0;
  }

  private async handleAudioChunk(data: ArrayBuffer): Promise<void> {
    try {
      const ctx = this.getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const audioBuffer = await ctx.decodeAudioData(data.slice(0));
      this.audioQueue.push(audioBuffer);
      this.playNextChunk();
    } catch (e) {
      console.error('Failed to decode audio chunk:', e);
    }
  }

  private playNextChunk(): void {
    const ctx = this.getAudioContext();
    if (this.audioQueue.length === 0) {
      return;
    }

    const buffer = this.audioQueue.shift()!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    // Schedule gapless playback — always after any previously scheduled audio
    const startTime = Math.max(this.nextPlayTime, ctx.currentTime);

    source.start(startTime);
    this.nextPlayTime = startTime + buffer.duration;
    this.currentSource = source;

    source.onended = () => {
      if (this.currentSource === source) {
        this.currentSource = null;
      }
      this.playNextChunk();
    };
  }

  stopAudio(): void {
    this.audioQueue = [];
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // already stopped
      }
      this.currentSource = null;
    }
    this.nextPlayTime = 0;
  }

  // ── Browser Mic Capture ─────────────────────────────────────────

  async startBrowserListening(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStream = stream;

      // Use a separate AudioContext for mic analysis (default sample rate matches mic)
      const micCtx = new AudioContext();
      await micCtx.resume();
      this.micAudioCtx = micCtx;
      const sourceNode = micCtx.createMediaStreamSource(stream);
      this.analyser = micCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      sourceNode.connect(this.analyser);

      // Reset speech detection
      this.peakRms = 0;

      // Record audio
      const recorder = new MediaRecorder(stream, { mimeType: this.getSupportedMimeType() });
      this.mediaRecorder = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (this.maxRecordTimer) {
          clearTimeout(this.maxRecordTimer);
          this.maxRecordTimer = null;
        }
        const capturedPeakRms = this.peakRms;
        this.cleanupMicStream();

        if (this.discardRecording || chunks.length === 0) {
          this.discardRecording = false;
          return;
        }

        // If no speech was detected (just ambient noise), don't send
        const SPEECH_THRESHOLD = 0.015;
        if (capturedPeakRms < SPEECH_THRESHOLD) {
          if (this.autoListen$.getValue()) {
            // Auto-listen: silently restart recording after a brief pause
            this.autoListenRestartTimer = setTimeout(() => {
              this.autoListenRestartTimer = null;
              if (this.autoListen$.getValue()) {
                this.startBrowserListening();
              } else {
                this.zone.run(() => this.status$.next('idle'));
              }
            }, 500);
          } else {
            this.zone.run(() => this.status$.next('idle'));
          }
          return;
        }

        const blob = new Blob(chunks, { type: recorder.mimeType });

        // Convert to WAV if needed, then send as binary
        const wavBytes = await this.blobToWav(blob);
        if (wavBytes && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(wavBytes);
        }
      };

      recorder.start(250); // collect in 250ms chunks

      // Safety net: max 30s recording to prevent stuck state
      this.maxRecordTimer = setTimeout(() => {
        this.maxRecordTimer = null;
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, 30000);

      // Start silence detection
      this.startSilenceDetection(recorder);

      this.zone.run(() => this.status$.next('listening'));
    } catch (e) {
      console.error('Mic access denied or failed:', e);
      this.zone.run(() => {
        this.info$.next('Mic access denied');
        this.status$.next('idle');
      });
    }
  }

  private startSilenceDetection(recorder: MediaRecorder): void {
    if (!this.analyser) return;

    const bufferLength = this.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    let silentFrames = 0;
    const SILENCE_THRESHOLD = 0.01;
    const SILENCE_DURATION_FRAMES = 12; // ~2s at 6fps check rate

    const check = () => {
      if (!this.analyser || recorder.state !== 'recording') return;

      this.analyser.getFloatTimeDomainData(dataArray);

      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / bufferLength);
      this.peakRms = Math.max(this.peakRms, rms);

      if (rms < SILENCE_THRESHOLD) {
        silentFrames++;
        if (silentFrames >= SILENCE_DURATION_FRAMES) {
          // Enough silence — stop recording
          recorder.stop();
          return;
        }
      } else {
        silentFrames = 0;
      }

      this.silenceTimer = setTimeout(check, 166); // ~6fps
    };

    // Wait 500ms before starting detection (avoid cutting off start)
    this.silenceTimer = setTimeout(check, 500);
  }

  stopBrowserListening(): void {
    this.clearAutoListenRestart();
    this.discardRecording = true;  // prevent onstop from sending audio
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.maxRecordTimer) {
      clearTimeout(this.maxRecordTimer);
      this.maxRecordTimer = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    this.cleanupMicStream();
  }

  /** Stop recording and send whatever was captured (user pressed stop while talking). */
  finishBrowserListening(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.maxRecordTimer) {
      clearTimeout(this.maxRecordTimer);
      this.maxRecordTimer = null;
    }
    // Force peakRms above threshold so onstop sends the audio
    this.peakRms = 1;
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();  // onstop fires, discardRecording is false → sends audio
    }
  }

  private cleanupMicStream(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    this.analyser = null;
    if (this.micAudioCtx) {
      this.micAudioCtx.close().catch(() => {});
      this.micAudioCtx = null;
    }
  }

  private getSupportedMimeType(): string {
    // Prefer WAV-compatible formats; fall back to what's available
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  private async blobToWav(blob: Blob): Promise<ArrayBuffer | null> {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const ctx = this.getAudioContext();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Encode as 16-bit PCM WAV
      const numChannels = 1;
      const sampleRate = 16000;

      // Resample to 16kHz mono
      const offlineCtx = new OfflineAudioContext(numChannels, audioBuffer.duration * sampleRate, sampleRate);
      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineCtx.destination);
      source.start();
      const resampled = await offlineCtx.startRendering();

      const samples = resampled.getChannelData(0);
      const buffer = new ArrayBuffer(44 + samples.length * 2);
      const view = new DataView(buffer);

      // WAV header
      const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
          view.setUint8(offset + i, str.charCodeAt(i));
        }
      };

      writeString(0, 'RIFF');
      view.setUint32(4, 36 + samples.length * 2, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numChannels * 2, true);
      view.setUint16(32, numChannels * 2, true);
      view.setUint16(34, 16, true);
      writeString(36, 'data');
      view.setUint32(40, samples.length * 2, true);

      // Write samples
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }

      return buffer;
    } catch (e) {
      console.error('Failed to convert audio to WAV:', e);
      return null;
    }
  }

  // ── Private ─────────────────────────────────────────────────────

  private clearAutoListenRestart(): void {
    if (this.autoListenRestartTimer) {
      clearTimeout(this.autoListenRestartTimer);
      this.autoListenRestartTimer = null;
    }
  }

  private send(msg: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  newSession(): void {
    this.send({ cmd: 'new_session' });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(this.currentAgentId || 'shadow');
    }, RECONNECT_INTERVAL);
  }
}
