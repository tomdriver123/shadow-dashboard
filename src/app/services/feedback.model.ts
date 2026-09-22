export type FeedbackAuthor = 'tom' | 'sabrina';

export type FeedbackStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'PARKED' | 'BLOCKED';

export interface FeedbackEntry {
  id: string;
  author: FeedbackAuthor;
  created: string;
  status: FeedbackStatus | string;
  text: string;
  images: string[];
  ticket: string | null;
  resolved: string | null;
  resolvedAt: string | null;
  pending?: boolean;
  localImageUrls?: string[];
}

export interface PendingImage {
  name: string;
  type: string;
  blob: Blob;
}

export interface PendingEntry {
  id: string;
  author: FeedbackAuthor;
  created: string;
  text: string;
  images: PendingImage[];
}

export const FEEDBACK_AUTHOR_NAMES: Record<FeedbackAuthor, string> = {
  tom: 'Tom',
  sabrina: 'Sabrina',
};

export const FEEDBACK_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Logged',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  PARKED: 'Parked',
  BLOCKED: 'Blocked',
};
