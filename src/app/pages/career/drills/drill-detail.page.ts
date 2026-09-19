import { Component, OnInit, inject } from '@angular/core';
import { formatDate } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { combineLatest } from 'rxjs';
import { CareerService } from '../../../services/career.service';
import { DrillAttempt, DrillProblem, RedoItem } from '../../../services/career.model';

/**
 * Drill problem detail: header, attempt history, redo reason if queued,
 * and external lookup links. Data source: CareerService.getDrillProblem(id),
 * cross referenced against drills.redoQueue by problem name for the redo
 * reason (DrillProblem itself carries no redo field).
 */
@Component({
  selector: 'app-career-drill-detail',
  templateUrl: './drill-detail.page.html',
  styleUrls: ['./drill-detail.page.scss'],
  standalone: false,
})
export class DrillDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly careerService = inject(CareerService);

  loading = true;
  error = false;
  problem: DrillProblem | null = null;
  redoItem: RedoItem | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    combineLatest([this.careerService.getDrillProblem(id), this.careerService.getCareerData()]).subscribe({
      next: ([problem, data]) => {
        this.problem = problem ?? null;
        this.redoItem = problem ? data.drills.redoQueue.find((r) => r.problem === problem.name) ?? null : null;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  get sortedAttempts(): DrillAttempt[] {
    if (!this.problem) return [];
    return [...this.problem.attempts].sort((a, b) => b.date.localeCompare(a.date));
  }

  stateBadgeClass(state: string): string {
    switch (state) {
      case 'learned':
        return 'badge--advanced';
      case 'due':
      case 'overdue':
        return 'badge--accent';
      case 'struggling':
        return 'badge--rejected';
      default:
        return 'badge--muted'; // scheduled
    }
  }

  formatDateOrDash(dateStr: string | null): string {
    if (!dateStr) return '—';
    return formatDate(new Date(`${dateStr}T12:00:00`), 'MMM d', 'en-US');
  }

  neetcodeUrl(name: string): string {
    return `https://neetcode.io/practice?q=${encodeURIComponent(name)}`;
  }

  leetcodeUrl(name: string): string {
    return `https://leetcode.com/problemset/?search=${encodeURIComponent(name)}`;
  }
}
