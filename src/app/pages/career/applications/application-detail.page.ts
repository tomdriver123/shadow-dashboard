import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CareerService } from '../../../services/career.service';
import { CareerApplication, CommsEntry } from '../../../services/career.model';

/**
 * Application detail: header, posting link, comp/points basis, fit,
 * timeline, resume variant, linked pipeline opportunity, and comms.
 * Route: /tabs/career/applications/:id
 */
@Component({
  selector: 'app-career-application-detail',
  templateUrl: './application-detail.page.html',
  styleUrls: ['./application-detail.page.scss'],
  standalone: false,
})
export class ApplicationDetailPage implements OnInit {
  loading = true;
  error = false;
  application: CareerApplication | null = null;
  comms: CommsEntry[] = [];

  private readonly route = inject(ActivatedRoute);
  private readonly careerService = inject(CareerService);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading = false;
      return;
    }
    this.careerService.getApplication(id).subscribe({
      next: (app) => {
        this.application = app ?? null;
        this.loading = false;
        if (app) this.loadComms(app);
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  private loadComms(app: CareerApplication): void {
    this.careerService.getCareerData().subscribe({
      next: (data) => {
        this.comms = this.matchComms(data.comms, app);
      },
    });
  }

  private matchComms(comms: CommsEntry[], app: CareerApplication): CommsEntry[] {
    const firstWord = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const appFirst = firstWord(app.company);
    return comms.filter(
      (c) => firstWord(c.company) === appFirst || (!!app.pipelineId && c.pipelineId === app.pipelineId),
    );
  }

  statusBadgeClass(status: string): string {
    if (status === 'submitted') return 'badge--awaiting';
    if (status === 'screen' || status === 'assessment' || status === 'interview') return 'badge--advanced';
    if (status === 'offer') return 'badge--accent';
    if (status === 'rejected') return 'badge--rejected';
    return 'badge--muted';
  }

  laneLabel(lane: string | null): string {
    if (lane === 'lane-a') return 'A';
    if (lane === 'lane-b') return 'B';
    return '—';
  }
}
