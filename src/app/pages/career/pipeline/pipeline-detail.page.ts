import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { combineLatest } from 'rxjs';
import { CareerService } from '../../../services/career.service';
import { careerScopeFromRoute } from '../../../services/career-scope';
import { CommsEntry, PipelineOpportunity, PipelineStage } from '../../../services/career.model';

type ProcessMarker = 'done' | 'current' | 'upcoming';

interface ProcessStep {
  text: string;
  marker: ProcessMarker;
}

@Component({
  selector: 'app-career-pipeline-detail',
  templateUrl: './pipeline-detail.page.html',
  styleUrls: ['./pipeline-detail.page.scss'],
  standalone: false,
})
export class PipelineDetailPage implements OnInit {
  loading = true;
  error = false;
  opp: PipelineOpportunity | null = null;
  comms: CommsEntry[] = [];

  private readonly route = inject(ActivatedRoute);
  private readonly careerService = inject(CareerService);

  readonly scope = careerScopeFromRoute(inject(ActivatedRoute));

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    combineLatest([
      this.careerService.getOpportunity(this.scope, id),
      this.careerService.getCareerData(this.scope),
    ]).subscribe({
      next: ([opp, data]) => {
        this.opp = opp ?? null;
        this.comms = data.comms.filter((c) => c.pipelineId === id);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  // "Their process" as the company laid it out, matched against the
  // structured stages array by position (falling back to a name match) to
  // mark each step done / current / upcoming. The first not-done step is
  // "current"; everything after it is "upcoming".
  get processSteps(): ProcessStep[] {
    const opp = this.opp;
    if (!opp) return [];
    const doneFlags = opp.process.map((text, i) => this.isStepDone(opp, text, i));
    const firstNotDone = doneFlags.findIndex((done) => !done);
    return opp.process.map((text, i) => {
      let marker: ProcessMarker;
      if (firstNotDone === -1 || i < firstNotDone) marker = 'done';
      else if (i === firstNotDone) marker = 'current';
      else marker = 'upcoming';
      return { text, marker };
    });
  }

  ballLabel(ball: string): string {
    if (ball === 'tom') return 'Your move';
    if (ball === 'them') return 'Waiting on them';
    return '';
  }

  stageStatusClass(status: string): string {
    if (status === 'done' || status === 'passed') return 'badge--advanced';
    if (status === 'failed') return 'badge--rejected';
    if (status === 'awaiting') return 'badge--awaiting';
    return 'badge--muted';
  }

  overallStatusClass(status: string): string {
    if (status === 'active') return 'badge--advanced';
    if (status === 'offer') return 'badge--accent';
    if (status === 'rejected') return 'badge--rejected';
    return 'badge--muted';
  }

  pointsBasisText(opp: PipelineOpportunity): string {
    const b = opp.pointsBasis;
    if (!b) return '';
    const parts: string[] = [];
    if (b.salaryMid !== null) parts.push('$' + b.salaryMid.toLocaleString() + ' salary');
    parts.push(b.daysOffice + (b.daysOffice === 1 ? ' office day' : ' office days'));
    parts.push(b.employment);
    if (b.assumptions.length) parts.push(b.assumptions.join(', '));
    return parts.join(', ');
  }

  private isStepDone(opp: PipelineOpportunity, text: string, index: number): boolean {
    const positional = opp.stages[index];
    const stage = positional ?? this.findStageByName(opp.stages, text);
    return !!stage && (stage.status === 'done' || stage.status === 'passed');
  }

  private findStageByName(stages: PipelineStage[], text: string): PipelineStage | null {
    const lower = text.toLowerCase();
    return stages.find((s) => s.name && lower.includes(s.name.toLowerCase())) ?? null;
  }
}
