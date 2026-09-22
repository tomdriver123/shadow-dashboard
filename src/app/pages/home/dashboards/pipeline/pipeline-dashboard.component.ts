import { Component, OnInit } from '@angular/core';
import { CareerService } from '../../../../services/career.service';
import { CAREER_SCOPES } from '../../../../services/career-scope';
import { CareerData, NeedsYouItem, NeedsYouKind, PipelineOpportunity, ScheduleEvent } from '../../../../services/career.model';

@Component({
  selector: 'app-pipeline-dashboard',
  templateUrl: './pipeline-dashboard.component.html',
  styleUrls: ['./pipeline-dashboard.component.scss'],
  standalone: false,
})
export class PipelineDashboardComponent implements OnInit {
  data: CareerData | null = null;
  loading = true;
  error = false;

  constructor(private careerService: CareerService) {}

  ngOnInit() {
    this.careerService.getCareerData(CAREER_SCOPES.tom).subscribe({
      next: (data) => {
        this.data = data;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  trackByIndex(index: number): number {
    return index;
  }

  get activeCount(): number {
    return (this.data?.pipeline ?? []).filter((p) => p.status === 'active').length;
  }

  get needsYouPreview(): NeedsYouItem[] {
    return (this.data?.needsYou ?? []).filter((item) => item.kind === 'pipeline' || item.kind === 'comms').slice(0, 5);
  }

  get upcomingPreview(): ScheduleEvent[] {
    return this.data?.schedule.upcoming.slice(0, 2) ?? [];
  }

  get topPipeline(): PipelineOpportunity[] {
    const active = (this.data?.pipeline ?? []).filter((p) => p.status === 'active');
    return [...active]
      .sort((a, b) => {
        if (a.points === null && b.points === null) return 0;
        if (a.points === null) return 1;
        if (b.points === null) return -1;
        return b.points - a.points;
      })
      .slice(0, 6);
  }

  // ── Needs you ─────────────────────────────────────────────────────────
  // Copied from career.page.ts (needsYouIcon).
  needsYouIcon(kind: NeedsYouKind): string {
    switch (kind) {
      case 'pipeline':
        return 'briefcase-outline';
      case 'comms':
        return 'mail-outline';
      case 'drills':
        return 'school-outline';
      case 'queue':
        return 'layers-outline';
      default:
        return 'alert-circle-outline';
    }
  }
}
