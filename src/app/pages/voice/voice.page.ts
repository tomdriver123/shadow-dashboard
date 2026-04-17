import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { VoiceService } from '../../services/voice.service';
import { AgentService } from '../../services/agent.service';
import { VoiceStatus, VoiceTranscript, VoiceSession } from '../../services/voice.model';
import { Agent } from '../../services/agent.model';
import { AgentProfileSheetComponent } from '../../components/agent-profile-sheet/agent-profile-sheet.component';

@Component({
  selector: 'app-voice',
  templateUrl: './voice.page.html',
  styleUrls: ['./voice.page.scss'],
  standalone: false,
})
export class VoicePage implements OnInit, OnDestroy {
  @ViewChild('transcriptEnd') transcriptEnd!: ElementRef;
  @ViewChild('inputField') inputField!: ElementRef;

  connected = false;
  status: VoiceStatus = 'idle';
  session: VoiceSession | null = null;
  autoListen = false;
  muted = false;
  transcripts: VoiceTranscript[] = [];
  inputText = '';

  agentId = 'shadow';
  agent: Agent | null = null;

  private subs: Subscription[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isLastInputPaste = false;

  constructor(
    private voiceService: VoiceService,
    private agentService: AgentService,
    private route: ActivatedRoute,
    private modalCtrl: ModalController,
  ) {}

  ngOnInit() {
    this.subs.push(
      this.route.paramMap.subscribe(params => {
        const id = params.get('agentId') || 'shadow';
        if (id !== this.agentId) {
          this.transcripts = [];
        }
        this.agentId = id;
        this.voiceService.connect(this.agentId);

        // Load agent metadata for this agent
        this.agentService.getAgent(this.agentId).subscribe(a => {
          if (a) this.agent = a;
        });
      }),
    );

    this.subs.push(
      this.voiceService.connected$.subscribe(c => this.connected = c),
      this.voiceService.status$.subscribe(s => this.status = s),
      this.voiceService.session$.subscribe(s => this.session = s),
      this.voiceService.autoListen$.subscribe(a => this.autoListen = a),
      this.voiceService.transcript$.subscribe(t => {
        this.transcripts.push(t);
        setTimeout(() => this.scrollToBottom(), 50);
      }),
      this.voiceService.transcriptHistory$.subscribe(history => {
        this.transcripts = history;
        setTimeout(() => this.scrollToBottom(), 50);
      }),
    );
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.voiceService.disconnect();
  }

  get agentName(): string {
    return this.agent?.name || this.agentId;
  }

  get agentColor(): string {
    return this.agent?.color || '#6366f1';
  }

  get statusLabel(): string {
    const labels: Record<VoiceStatus, string> = {
      idle: 'Ready',
      listening: 'Listening...',
      transcribing: 'Transcribing...',
      thinking: 'Thinking...',
      speaking: 'Speaking...',
    };
    return labels[this.status] || this.status;
  }

  get isBusy(): boolean {
    return this.status !== 'idle';
  }

  onPaste(): void {
    this.isLastInputPaste = true;
  }

  onInputChange(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (!this.inputText.trim()) return;

    // Auto-send only for paste/Wispr (not manual typing)
    if (this.isLastInputPaste) {
      this.isLastInputPaste = false;
      this.debounceTimer = setTimeout(() => {
        this.sendText();
      }, 800);
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.sendText();
    }
  }

  async sendText(): Promise<void> {
    const text = this.inputText.trim();
    if (!text || this.isBusy) return;
    await this.voiceService.primeAudio();
    this.voiceService.sendText(text);
    this.inputText = '';
  }

  get isBrowserAudio(): boolean {
    return this.voiceService.browserAudio;
  }

  async startListening(): Promise<void> {
    if (this.isBusy || this.muted) return;
    await this.voiceService.primeAudio();
    if (this.voiceService.browserAudio) {
      this.voiceService.startBrowserListening();
    } else {
      this.voiceService.startListening();
    }
  }

  stopAction(): void {
    this.voiceService.stop();
  }

  toggleAutoListen(): void {
    this.autoListen = !this.autoListen;
    this.voiceService.setAutoListen(this.autoListen);
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.voiceService.setMute(this.muted);
  }

  newSession(): void {
    this.voiceService.newSession();
    this.transcripts = [];
  }

  async openProfileModal(): Promise<void> {
    if (!this.agent) return;
    const modal = await this.modalCtrl.create({
      component: AgentProfileSheetComponent,
      componentProps: { agent: this.agent, showChatButton: false },
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await modal.present();
  }

  triggerHeartbeat(): void {
    // TODO: wire to server command — send { cmd: 'trigger_heartbeat', agent_id } via voiceService
  }

  private scrollToBottom(): void {
    if (this.transcriptEnd) {
      this.transcriptEnd.nativeElement.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
