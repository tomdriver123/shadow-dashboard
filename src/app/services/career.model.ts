// Types for career.json, emitted by dashboard/scripts/generate-career-data.js.
//
// status/source/lane/location are typed as `string`, not unions. The vault
// ledgers are hand-maintained free text (see the stale JobSource union in
// jobs.model.ts for what happens when a union drifts from real data); the
// KNOWN_* arrays below document the values seen so far for building filter
// pills, but new values showing up in the vault must not break the build.

export interface PointsBasis {
  salaryMid: number | null;
  daysOffice: number;
  employment: string;
  assumptions: string[];
}

export interface CareerApplication {
  id: string;
  date: string;
  company: string;
  role: string;
  url: string | null;
  sourceNote: string | null;
  resumeVariant: string | null;
  variantSlug: string | null;
  variantPdf: string | null;
  lane: string | null;
  status: string;
  nextAction: string | null;
  rejectedDate: string | null;
  followUpDate: string | null;
  daysSinceApplied: number | null;
  stale: boolean;
  queueId: string | null;
  score: number | null;
  salaryText: string | null;
  salaryMid: number | null;
  points: number | null;
  pointsBasis: PointsBasis | null;
  location: string | null;
  daysOffice: string | null;
  source: string | null;
  band: string;
  employment: string;
  pipelineId: string | null;
  fitBullets: string[];
}

export interface CareerQueueRow {
  id: string;
  date: string;
  company: string;
  role: string;
  url: string;
  source: string;
  salaryText: string;
  lane: string;
  score: number | null;
  status: string;
  location: string;
  daysOffice: string;
  applied: boolean;
  salaryMid: number | null;
  points: number | null;
  pointsBasis: PointsBasis;
}

export interface PipelineContact {
  name: string;
  role: string;
  email: string;
  phone?: string; // present on some contacts (e.g. staffing agency recruiters); passed through raw from frontmatter
}

export interface PipelineStage {
  name: string | null;
  type: string;
  date: string | null;
  durationMin: number | null;
  status: string;
  notes: string | null;
  with: string | null;
  link: string | null;
}

export interface PipelineOpportunity {
  id: string;
  company: string | null;
  role: string | null;
  applicationDate: string | null;
  applicationUrl: string | null;
  status: string;
  employment: string;
  location: string | null;
  daysOffice: number | string | null;
  salaryText: string | null;
  salarySource: string | null;
  contacts: PipelineContact[];
  process: string[];
  stages: PipelineStage[];
  ball: string;
  nextAction: string | null;
  nextActionDue: string | null;
  prepNotesMd: string;
  points: number | null;
  salaryMid: number | null;
  pointsBasis: PointsBasis;
  currentStage: string | null;
  applicationId: string | null;
}

export interface ScheduleEvent {
  date: string;
  endDate: string | null;
  company: string | null;
  role: string | null;
  stage: string | null;
  type: string;
  status: string;
  with: string | null;
  link: string | null;
  pipelineId: string;
}

export interface CommsEntry {
  date: string;
  company: string;
  direction: string;
  channel: string;
  who: string;
  summary: string;
  ball: string;
  due: string | null;
  pipelineId: string | null;
}

export interface DrillAttempt {
  date: string;
  problem: string;
  pattern: string;
  mode: string;
  score: string;
  result: string;
  nextDue: string | null;
}

export interface RedoItem {
  problem: string;
  pattern: string;
  due: string;
  mode: string;
  reason: string;
}

// learned | due | overdue | scheduled | struggling (struggling = 2+ "no
// pass" blind attempts and not learned). Kept as `string`, not a union, for
// the same reason as status/source/lane/location above.
export type DrillState = string;

export interface DrillProblem {
  id: string;
  name: string;
  pattern: string;
  topic: string;
  attempts: DrillAttempt[];
  guidedCount: number;
  blindCount: number;
  learned: boolean;
  lastScore: string | null;
  nextDue: string | null;
  state: DrillState;
}

export interface PatternAgg {
  topic: string;
  attempted: number;
  learned: number;
  decisionRate: number | null;
}

export interface AccuracyPoint {
  date: string;
  rate: number | null;
  cumulativeLearned: number;
}

export interface DrillsData {
  currentPositionMd: string;
  weakSpotsMd: string;
  redoQueue: RedoItem[];
  history: DrillAttempt[];
  problems: DrillProblem[];
  patterns: PatternAgg[];
  accuracySeries: AccuracyPoint[];
}

export interface ResumeVariant {
  slug: string;
  title: string;
  company: string | null;
  role: string | null;
  docType: string;
  created: string | null;
  hasPdf: boolean;
  pdfPath: string | null;
  pdfMtime: string | null;
  deltaLogPath: string;
}

export interface StrategyDoc {
  id: string;
  title: string;
  md: string;
}

export interface Playbook {
  baseResumeMd: string;
  variants: ResumeVariant[];
  docs: StrategyDoc[];
  lessonsMd: string;
}

export interface WeeklyMetric {
  weekStart: string;
  submitted: number;
  advanced: number;
  rejected: number;
}

export interface FunnelStage {
  stage: string;
  count: number;
}

export interface MetricsMix {
  location: Record<string, number>;
  band: Record<string, number>;
  employment: Record<string, number>;
  lane: Record<string, number>;
  source: Record<string, number>;
}

export interface LinkedinViewPoint {
  date: string;
  views: number | null;
}

export interface CareerMetrics {
  weekly: WeeklyMetric[];
  funnel: FunnelStage[];
  mix: MetricsMix;
  responseRate: number | null;
  medianDaysToRejection: number | null;
  staleIds: string[];
  linkedinViews: LinkedinViewPoint[];
}

// pipeline | comms | queue | drills. This set is generator-controlled (not
// free text lifted from the vault), so a union is safe here.
export type NeedsYouKind = 'pipeline' | 'comms' | 'queue' | 'drills';

export interface NeedsYouItem {
  kind: NeedsYouKind;
  title: string;
  due: string | null;
  link: string;
}

export interface CareerContext {
  person: string;
  huntStart: string;
  huntDay: number;
  lastDay: string | null;
  daysToLastDay: number | null;
}

export interface CareerKpis {
  applications: number;
  thisWeek: number;
  awaiting: number;
  rejected: number;
  responseRate: number | null;
  pipelineActive: number;
  upcomingEvents: number;
  needsYou: number;
  drillsLearned: number;
  drillsDue: number;
  drillAccuracy: number | null;
  queuePending: number;
}

export interface KbSummary {
  topics: number;
  questions: number;
  accuracy: number | null;
}

export interface KbOption {
  letter: string;
  text: string;
}

// mcq | recall
export type KbAttemptMode = string;

// pass | miss | guess | skip | recall pass | recall miss
export type KbAttemptResult = string;

export interface KbAttempt {
  date: string;
  mode: KbAttemptMode;
  pick: string | null;
  result: KbAttemptResult;
  tier: string;
}

// asked | due | learned | retired | queued. Kept as `string`, not a union,
// for the same reason as DrillState above.
export type KbStatus = string;

export interface KbQuestion {
  id: string;
  topic: string;
  key: string;
  kind: string;
  level: string; // fundamentals | medium | senior, like DrillState
  status: KbStatus;
  due: string | null;
  seen: number;
  label: string;
  stem: string;
  options: KbOption[];
  answer: string;
  why: string;
  rubric: string[];
  modelAnswer: string;
  versions: string | null;
  deck: string;
  firstAsked: string | null;
  attempts: KbAttempt[];
}

export interface KbLevelStat {
  asked: number;
  passed: number;
}

export interface KbTopicState {
  topic: string;
  prefix: string;
  level: string;
  streak: number;
  count: number;
  toPromote: number | null;
}

export interface KbRecallItem {
  id: string;
  topic: string;
  label: string;
  due: string;
}

export interface KbData extends KbSummary {
  activeDeck: string | null;
  byLevel: { fundamentals: KbLevelStat; medium: KbLevelStat; senior: KbLevelStat };
  topicStates: KbTopicState[];
  recallDue: KbRecallItem[];
  items: KbQuestion[];
  queue: string[];
  offlinePending: number;
  currentPositionMd: string;
  weakSpotsMd: string;
}

export interface CareerData {
  generatedAt: string;
  warnings: string[];
  context: CareerContext;
  kpis: CareerKpis;
  needsYou: NeedsYouItem[];
  applications: CareerApplication[];
  queue: CareerQueueRow[];
  pipeline: PipelineOpportunity[];
  schedule: { upcoming: ScheduleEvent[]; past: ScheduleEvent[] };
  comms: CommsEntry[];
  drills: DrillsData;
  playbook: Playbook;
  metrics: CareerMetrics;
  kb: KbData | null;
}

// ── Known-value reference arrays ───────────────────────────────────────────
// Documentation for filter pills etc, not enforced by the type system. Real
// vault data can and will introduce values outside these lists.

export const KNOWN_APPLICATION_STATUSES: string[] = [
  'drafting', 'submitted', 'screen', 'assessment', 'interview', 'offer', 'rejected', 'ghosted', 'withdrawn',
];

export const ADVANCED_APPLICATION_STATUSES: string[] = ['screen', 'assessment', 'interview', 'offer'];

export const KNOWN_QUEUE_STATUSES: string[] = [
  'pending', 'queued', 'manual', 'liked', 'needs-tom', 'applied', 'interviewing', 'blocked', 'passed', 'rejected', 'expired',
];

export const KNOWN_SOURCES: string[] = [
  'anthropic', 'ashby', 'ashby-api', 'company-sweep', 'greenhouse', 'greenhouse-api', 'hn-hiring',
  'indeed-alert', 'indeed-match', 'lever', 'linkedin-alert', 'tom', 'web-search', 'wellfound',
];

export const KNOWN_LANES: string[] = ['lane-a', 'lane-b'];

export const KNOWN_LOCATIONS: string[] = ['remote', 'nyc-hybrid', 'miami-hybrid', 'st-pete-hybrid', 'zionsville-hybrid'];

export const KNOWN_BANDS: string[] = ['senior', 'standard'];

export const KNOWN_EMPLOYMENT_TYPES: string[] = ['full-time', 'contract', 'contract-to-hire', 'gig'];

export const KNOWN_PIPELINE_STATUSES: string[] = ['active', 'offer', 'rejected', 'withdrawn', 'closed'];

export const KNOWN_STAGE_TYPES: string[] = [
  'assessment', 'recruiter-screen', 'hiring-manager', 'technical', 'system-design', 'onsite', 'final', 'offer', 'other',
];

export const KNOWN_STAGE_STATUSES: string[] = ['upcoming', 'scheduled', 'done', 'passed', 'failed', 'awaiting'];

export const KNOWN_BALL_STATES: string[] = ['tom', 'them', 'none'];

export const KNOWN_DRILL_STATES: string[] = ['learned', 'due', 'overdue', 'scheduled', 'struggling'];

export const KNOWN_COMMS_DIRECTIONS: string[] = ['in', 'out'];

export const KNOWN_COMMS_CHANNELS: string[] = ['email', 'linkedin', 'phone', 'text', 'other'];

// ── Trivial type guards ────────────────────────────────────────────────────

export function isAdvancedStatus(status: string): boolean {
  return ADVANCED_APPLICATION_STATUSES.includes(status);
}

export function isDrillActionable(state: DrillState): boolean {
  return state === 'due' || state === 'overdue' || state === 'struggling';
}
