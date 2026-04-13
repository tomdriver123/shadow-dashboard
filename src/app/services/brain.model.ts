export interface QueueItem {
  priority: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE';
  topic: string;
  goal: string;
  addedBy: string;
  dateAdded: string;
}

export interface QueueData {
  pending: number;
  inProgress: number;
  done: number;
  total: number;
  items: QueueItem[];
}

export interface InsightFinding {
  headline: string;
  detail: string;
}

export interface Insight {
  id: string;
  domain: 'Finance' | 'Health' | 'Career' | 'Shadow' | 'Other';
  title: string;
  priority: number;
  priorityEmoji: string;
  priorityColor: string;
  goalTag: string | null;
  pattern: string | null;
  actionable: string | null;
  actionability?: string | null;
  date?: string | null;
  findings?: InsightFinding[];
  content: string;
  type: 'structured' | 'synthesis';
}

export interface Connection {
  id: string;
  title: string;
  domains: string[];
  sources: string | null;
  pattern: string;
  goalTag: string | null;
}

export interface BrainData {
  generatedAt: string;
  queue: QueueData;
  insights: Insight[];
  connections: Connection[];
}

export const DOMAIN_COLORS: Record<string, string> = {
  Finance: '#10b981',
  Health: '#6366f1',
  Career: '#f59e0b',
  Shadow: '#a855f7',
  Other: '#6b7280',
};

export const DOMAIN_ICONS: Record<string, string> = {
  Finance: 'cash-outline',
  Health: 'heart-outline',
  Career: 'briefcase-outline',
  Shadow: 'bulb-outline',
  Other: 'ellipse-outline',
};
