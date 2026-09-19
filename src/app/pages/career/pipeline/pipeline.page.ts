import { Component, inject, OnInit } from '@angular/core';
import { CareerService } from '../../../services/career.service';
import { CareerData, PipelineOpportunity } from '../../../services/career.model';

interface StageColumnDef {
  key: string;
  label: string;
  types: string[];
}

export interface PipelineColumn {
  key: string;
  label: string;
  count: number;
  items: PipelineOpportunity[];
}

// Fixed board order. "screen" absorbs recruiter-screen, hiring-manager and
// other (the catch-all bucket for process steps that are not one of the
// named stage types yet, e.g. rate confirmation, ID checks).
const STAGE_COLUMNS: StageColumnDef[] = [
  { key: 'assessment', label: 'Assessment', types: ['assessment'] },
  { key: 'screen', label: 'Screen', types: ['recruiter-screen', 'hiring-manager', 'other'] },
  { key: 'technical', label: 'Technical', types: ['technical'] },
  { key: 'design-onsite', label: 'Design or Onsite', types: ['system-design', 'onsite'] },
  { key: 'final', label: 'Final', types: ['final'] },
  { key: 'offer', label: 'Offer', types: ['offer'] },
];

@Component({
  selector: 'app-career-pipeline',
  templateUrl: './pipeline.page.html',
  styleUrls: ['./pipeline.page.scss'],
  standalone: false,
})
export class PipelinePage implements OnInit {
  loading = true;
  error = false;
  data: CareerData | null = null;
  columns: PipelineColumn[] = [];

  private readonly careerService = inject(CareerService);

  ngOnInit(): void {
    this.careerService.getCareerData().subscribe({
      next: (data) => {
        this.data = data;
        this.columns = this.buildColumns(data.pipeline);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  get pipeline(): PipelineOpportunity[] {
    return this.data?.pipeline ?? [];
  }

  // Next event date for this opportunity: earliest matching upcoming
  // schedule entry, falling back to the vault's next_action_due.
  nextEventDate(opp: PipelineOpportunity): string | null {
    const upcoming = this.data?.schedule.upcoming ?? [];
    const matches = upcoming
      .filter((e) => e.pipelineId === opp.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return matches.length ? matches[0].date : opp.nextActionDue;
  }

  ballLabel(ball: string): string {
    return ball === 'tom' ? 'Your move' : 'Waiting on them';
  }

  private buildColumns(pipeline: PipelineOpportunity[]): PipelineColumn[] {
    const sorted = [...pipeline].sort((a, b) => this.statusRank(a.status) - this.statusRank(b.status));
    return STAGE_COLUMNS.map((col) => {
      const items = sorted.filter((opp) => this.columnKeyFor(opp) === col.key);
      return { key: col.key, label: col.label, count: items.length, items };
    });
  }

  private statusRank(status: string): number {
    return status === 'active' ? 0 : 1;
  }

  private columnKeyFor(opp: PipelineOpportunity): string {
    const type = this.currentStageType(opp);
    const col = STAGE_COLUMNS.find((c) => c.types.includes(type));
    return col ? col.key : 'screen';
  }

  private currentStageType(opp: PipelineOpportunity): string {
    const current = opp.currentStage;
    if (current) {
      const match = opp.stages.find((s) => s.name === current);
      if (match) return match.type;
    }
    if (opp.stages.length) return opp.stages[opp.stages.length - 1].type;
    return 'other';
  }
}
