import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Subject, takeUntil } from 'rxjs';
import { RefreshService, RefreshTarget, RefreshTargetState } from '../../services/refresh.service';

const RELATIVE_TICK_MS = 60000;

/**
 * Drop in refresh control for a page toolbar or a home tile corner. Shows a
 * spinner while its target is running, a relative "Updated" label built
 * from the generatedAt input, and disables itself with a tooltip when the
 * local API is unreachable. See services/refresh.service.ts for the
 * request and fan out contract this wraps.
 */
@Component({
  selector: 'sh-refresh-button',
  templateUrl: './refresh-button.component.html',
  styleUrls: ['./refresh-button.component.scss'],
  standalone: false,
})
export class RefreshButtonComponent implements OnInit, OnChanges, OnDestroy {
  @Input() target: RefreshTarget = 'all';
  @Input() person?: 'tom' | 'sabrina';
  @Input() generatedAt: string | null = null;
  @Input() label = '';
  @Input() compact = false;
  @Output() refreshed = new EventEmitter<void>();

  running = false;
  available: boolean | null = null;
  relative = '';

  private refreshService = inject(RefreshService);
  private toastCtrl = inject(ToastController);
  private destroy$ = new Subject<void>();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.refreshService.isRunning(this.target).pipe(takeUntil(this.destroy$)).subscribe((running) => {
      this.running = running;
    });
    this.refreshService.apiAvailable$.pipe(takeUntil(this.destroy$)).subscribe((available) => {
      this.available = available;
    });
    this.refreshService.loadStatus();
    this.updateRelative();
    this.intervalId = setInterval(() => this.updateRelative(), RELATIVE_TICK_MS);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['generatedAt']) this.updateRelative();
  }

  ngOnDestroy(): void {
    if (this.intervalId !== null) clearInterval(this.intervalId);
    this.destroy$.next();
    this.destroy$.complete();
  }

  get tooltip(): string {
    if (this.available === false) return 'Local API is not running. Start it with npm start.';
    return `Refresh ${this.target}`;
  }

  onClick(): void {
    if (this.running || this.available === false) return;
    this.refreshService.refresh(this.target, { person: this.person }).subscribe({
      next: (result) => {
        this.refreshed.emit();
        if (!result.ok) {
          const message = this.firstProblem(result.targets) ?? 'Refresh finished with a problem.';
          void this.showToast(message);
        }
      },
      error: () => {
        void this.showToast('Refresh failed. Is the local API running?');
      },
    });
  }

  private firstProblem(targets: Record<string, RefreshTargetState>): string | null {
    for (const state of Object.values(targets)) {
      if (state.error) return state.error;
    }
    for (const state of Object.values(targets)) {
      if (state.warnings?.length) return state.warnings[0];
    }
    return null;
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 4000,
      position: 'bottom',
      color: 'danger',
    });
    await toast.present();
  }

  private updateRelative(): void {
    this.relative = this.formatRelative(this.generatedAt);
  }

  private formatRelative(iso: string | null): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const diffSec = Math.floor((Date.now() - then) / 1000);
    if (diffSec < 60) return 'Updated just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Updated ${diffMin} min ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `Updated ${diffHours} h ago`;
    return `Updated ${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
}
