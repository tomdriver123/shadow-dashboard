export type VoiceStatus = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

export interface VoiceTranscript {
  role: 'user' | 'agent';
  text: string;
  timestamp: Date;
}

export interface VoiceSession {
  id: string | null;
  name: string | null;
  backend: string;
}
