export type JobLane = 'lane-a' | 'lane-b';
export type JobStatus = 'pending' | 'queued' | 'manual' | 'liked' | 'passed' | 'applied' | 'needs-tom' | 'blocked' | 'expired';
export type JobSource = 'hn-hiring' | 'wellfound' | 'ai-jobs.net' | 'yc-startup' | 'anthropic' | 'websearch';

export interface JobRec {
  id: string;            // slug matching queue.md ledger
  company: string;
  role: string;
  url: string;
  source: JobSource;
  salaryText: string;    // as stated in posting, or 'unstated'
  posted: string | null; // YYYY-MM-DD or null
  found: string;         // YYYY-MM-DD scan date
  lane: JobLane;
  score: number;         // 1-10
  fitBullets: string[];  // exactly 3
  status: JobStatus;
  location?: string;
  daysOffice?: string;
}

export interface JobsData {
  generatedAt: string;
  pendingCount: number;
  recs: JobRec[];
}

export interface VerdictResponse {
  ok: boolean;
  id: string;
  verdict: string;
  message: string;
}
