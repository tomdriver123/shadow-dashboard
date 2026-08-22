import { Component, OnInit } from '@angular/core';
import { JobsService } from '../../../../services/jobs.service';
import { JobRec, JobsData } from '../../../../services/jobs.model';

@Component({
  selector: 'app-jobs-dashboard',
  templateUrl: './jobs-dashboard.component.html',
  styleUrls: ['./jobs-dashboard.component.scss'],
  standalone: false,
})
export class JobsDashboardComponent implements OnInit {
  data: JobsData | null = null;
  loading = true;
  error = false;
  verdictState: Record<string, 'liked' | 'passed' | 'voting'> = {};

  constructor(private jobsService: JobsService) {}

  ngOnInit() {
    this.jobsService.getJobsData().subscribe({
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

  vote(rec: JobRec, verdict: 'liked' | 'passed'): void {
    if (this.verdictState[rec.id]) return;
    this.verdictState[rec.id] = 'voting';
    this.jobsService.postVerdict(rec.id, verdict).subscribe({
      next: (res) => {
        if (res.ok) {
          this.verdictState[rec.id] = verdict;
          rec.status = verdict;
        } else {
          delete this.verdictState[rec.id];
        }
      },
      error: () => {
        delete this.verdictState[rec.id];
      },
    });
  }

  isVoting(rec: JobRec): boolean {
    return this.verdictState[rec.id] === 'voting';
  }

  hasVoted(rec: JobRec): boolean {
    return this.verdictState[rec.id] === 'liked' || this.verdictState[rec.id] === 'passed';
  }

  openUrl(url: string): void {
    window.open(url, '_blank', 'noopener');
  }
}
