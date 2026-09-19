import { Component, OnInit, inject } from '@angular/core';
import { CareerService } from '../../../services/career.service';
import { JobsService } from '../../../services/jobs.service';
import { CareerApplication, CareerData, CareerQueueRow } from '../../../services/career.model';

type SubTab = 'submitted' | 'queue';
type SortKey = 'date' | 'company' | 'points' | 'score';
type StatusFilter = 'all' | 'submitted' | 'screen' | 'assessment' | 'interview' | 'offer' | 'rejected' | 'stale';
type LaneFilter = 'all' | 'lane-a' | 'lane-b';
type BandFilter = 'all' | 'senior' | 'standard';
type LocationFilter = 'all' | 'remote' | 'hybrid';
type QueueStatusFilter = 'all' | 'queued' | 'manual' | 'needs-tom' | 'liked' | 'blocked' | 'passed' | 'expired';

interface FilterOption<T> {
  value: T;
  label: string;
}

/**
 * Applications list: Submitted (search + filters + sort over data.applications)
 * and Queue (scan queue rows not yet applied, with like/pass voting).
 * Data source: CareerService (assets/data/career.json, generated from the vault).
 */
@Component({
  selector: 'app-career-applications',
  templateUrl: './applications.page.html',
  styleUrls: ['./applications.page.scss'],
  standalone: false,
})
export class ApplicationsPage implements OnInit {
  loading = true;
  error = false;

  tab: SubTab = 'submitted';

  // Submitted filters
  search = '';
  statusFilter: StatusFilter = 'all';
  laneFilter: LaneFilter = 'all';
  bandFilter: BandFilter = 'all';
  locationFilter: LocationFilter = 'all';
  sortKey: SortKey = 'date';

  // Queue filters
  queueStatusFilter: QueueStatusFilter = 'all';

  applications: CareerApplication[] = [];
  queue: CareerQueueRow[] = [];

  // Queue voting (copied from jobs-dashboard.component.ts verdict pattern)
  verdictState: Record<string, 'liked' | 'passed' | 'voting'> = {};

  readonly statusFilters: FilterOption<StatusFilter>[] = [
    { value: 'all', label: 'All' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'screen', label: 'Screen' },
    { value: 'assessment', label: 'Assessment' },
    { value: 'interview', label: 'Interview' },
    { value: 'offer', label: 'Offer' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'stale', label: 'Stale' },
  ];

  readonly laneFilters: FilterOption<LaneFilter>[] = [
    { value: 'all', label: 'All' },
    { value: 'lane-a', label: 'A' },
    { value: 'lane-b', label: 'B' },
  ];

  readonly bandFilters: FilterOption<BandFilter>[] = [
    { value: 'all', label: 'All' },
    { value: 'senior', label: 'Senior' },
    { value: 'standard', label: 'Standard' },
  ];

  readonly locationFilters: FilterOption<LocationFilter>[] = [
    { value: 'all', label: 'All' },
    { value: 'remote', label: 'Remote' },
    { value: 'hybrid', label: 'Hybrid' },
  ];

  readonly sortOptions: FilterOption<SortKey>[] = [
    { value: 'date', label: 'Newest' },
    { value: 'company', label: 'Company' },
    { value: 'points', label: 'Points' },
    { value: 'score', label: 'Score' },
  ];

  readonly queueStatusFilters: FilterOption<QueueStatusFilter>[] = [
    { value: 'all', label: 'All' },
    { value: 'queued', label: 'Queued' },
    { value: 'manual', label: 'Manual' },
    { value: 'needs-tom', label: 'Needs you' },
    { value: 'liked', label: 'Liked' },
    { value: 'blocked', label: 'Blocked' },
    { value: 'passed', label: 'Passed' },
    { value: 'expired', label: 'Expired' },
  ];

  private readonly careerService = inject(CareerService);
  private readonly jobsService = inject(JobsService);

  ngOnInit(): void {
    this.careerService.getCareerData().subscribe({
      next: (data: CareerData) => {
        this.applications = data.applications;
        this.queue = data.queue;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  setTab(tab: SubTab): void {
    this.tab = tab;
  }

  // ── Submitted ────────────────────────────────────────────────────────────

  get filteredApplications(): CareerApplication[] {
    const q = this.search.trim().toLowerCase();
    const rows = this.applications.filter((a) => {
      if (q && !`${a.company} ${a.role}`.toLowerCase().includes(q)) return false;
      if (this.statusFilter === 'stale') {
        if (!a.stale) return false;
      } else if (this.statusFilter !== 'all' && a.status !== this.statusFilter) {
        return false;
      }
      if (this.laneFilter !== 'all' && a.lane !== this.laneFilter) return false;
      if (this.bandFilter !== 'all' && a.band !== this.bandFilter) return false;
      if (this.locationFilter === 'remote' && a.location !== 'remote') return false;
      if (this.locationFilter === 'hybrid' && !(a.location && a.location.includes('hybrid'))) return false;
      return true;
    });
    return this.sortApplications(rows);
  }

  get filtersActive(): boolean {
    return (
      !!this.search ||
      this.statusFilter !== 'all' ||
      this.laneFilter !== 'all' ||
      this.bandFilter !== 'all' ||
      this.locationFilter !== 'all'
    );
  }

  resetFilters(): void {
    this.search = '';
    this.statusFilter = 'all';
    this.laneFilter = 'all';
    this.bandFilter = 'all';
    this.locationFilter = 'all';
  }

  private sortApplications(rows: CareerApplication[]): CareerApplication[] {
    const sorted = [...rows];
    switch (this.sortKey) {
      case 'company':
        sorted.sort((a, b) => a.company.localeCompare(b.company));
        break;
      case 'points':
        sorted.sort((a, b) => (b.points ?? -1) - (a.points ?? -1));
        break;
      case 'score':
        sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
        break;
      case 'date':
      default:
        sorted.sort((a, b) => b.date.localeCompare(a.date));
        break;
    }
    return sorted;
  }

  setStatusFilter(v: StatusFilter): void {
    this.statusFilter = v;
  }

  setLaneFilter(v: LaneFilter): void {
    this.laneFilter = v;
  }

  setBandFilter(v: BandFilter): void {
    this.bandFilter = v;
  }

  setLocationFilter(v: LocationFilter): void {
    this.locationFilter = v;
  }

  setSortKey(v: SortKey): void {
    this.sortKey = v;
  }

  statusBadgeClass(status: string): string {
    if (status === 'submitted') return 'badge--awaiting';
    if (status === 'screen' || status === 'assessment' || status === 'interview') return 'badge--advanced';
    if (status === 'offer') return 'badge--accent';
    if (status === 'rejected') return 'badge--rejected';
    return 'badge--muted'; // ghosted, withdrawn, drafting, anything else the vault introduces
  }

  laneLabel(lane: string | null): string {
    if (lane === 'lane-a') return 'A';
    if (lane === 'lane-b') return 'B';
    return '—';
  }

  locationLabel(loc: string | null): string {
    if (!loc) return '—';
    if (loc === 'remote') return 'Remote';
    if (!loc.endsWith('-hybrid')) return loc;
    const city = loc.slice(0, loc.length - '-hybrid'.length);
    const label = city
      .split('-')
      .map((w) => (w === 'nyc' ? 'NYC' : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');
    return `${label} Hybrid`;
  }

  // ── Queue ────────────────────────────────────────────────────────────────

  get queueNotApplied(): CareerQueueRow[] {
    return this.queue.filter((r) => r.status !== 'applied');
  }

  get filteredQueue(): CareerQueueRow[] {
    const rows = this.queueNotApplied;
    if (this.queueStatusFilter === 'all') return rows;
    return rows.filter((r) => r.status === this.queueStatusFilter);
  }

  setQueueStatusFilter(v: QueueStatusFilter): void {
    this.queueStatusFilter = v;
  }

  queueBadgeClass(status: string): string {
    if (status === 'needs-tom') return 'badge--accent';
    if (status === 'expired' || status === 'passed') return 'badge--muted';
    if (status === 'rejected' || status === 'blocked') return 'badge--rejected';
    if (status === 'interviewing' || status === 'liked') return 'badge--advanced';
    return 'badge--awaiting'; // queued, manual, pending
  }

  queueBadgeLabel(status: string): string {
    return status === 'needs-tom' ? 'Parked, needs you' : status;
  }

  showVerdictButtons(row: CareerQueueRow): boolean {
    // Buttons render for rows still queued/manual, and stay visible through
    // a vote in progress or just completed (verdictState survives the local
    // row.status flip below so the confirmed state doesn't vanish mid-look).
    return row.status === 'queued' || row.status === 'manual' || !!this.verdictState[row.id];
  }

  vote(row: CareerQueueRow, verdict: 'liked' | 'passed'): void {
    if (this.verdictState[row.id]) return;
    this.verdictState[row.id] = 'voting';
    this.jobsService.postVerdict(row.id, verdict).subscribe({
      next: (res) => {
        if (res.ok) {
          this.verdictState[row.id] = verdict;
          row.status = verdict;
        } else {
          delete this.verdictState[row.id];
        }
      },
      error: () => {
        delete this.verdictState[row.id];
      },
    });
  }

  isVoting(row: CareerQueueRow): boolean {
    return this.verdictState[row.id] === 'voting';
  }

  hasVoted(row: CareerQueueRow): boolean {
    return this.verdictState[row.id] === 'liked' || this.verdictState[row.id] === 'passed';
  }
}
