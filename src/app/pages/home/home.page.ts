import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { DASHBOARDS } from './dashboard-registry';
import { PortalService } from '../../services/portal.service';

@Component({
  selector: 'app-home-shell',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false,
})
export class HomeShellPage implements AfterViewInit, OnDestroy {
  @ViewChild('swiperEl') swiperRef!: ElementRef<HTMLElement & { swiper?: any }>;

  dashboards = DASHBOARDS;
  initialSlide = 0;
  activeIndex = 0;

  private destroy$ = new Subject<void>();
  private portal = inject(PortalService);

  /** The header button marks the tab so Sabrina's portal shows a way back. */
  enterSabrina(): void {
    this.portal.markEnteredFromTom();
  }

  constructor(private route: ActivatedRoute, private router: Router) {
    const id = this.route.snapshot.paramMap.get('dashboardId');
    const idx = DASHBOARDS.findIndex(d => d.id === id);
    this.initialSlide = Math.max(0, idx);
    this.activeIndex = this.initialSlide;
  }

  ngAfterViewInit() {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const id = params.get('dashboardId');
      const idx = DASHBOARDS.findIndex(d => d.id === id);
      if (idx > -1 && idx !== this.activeIndex) {
        this.activeIndex = idx;
        this.swiperRef.nativeElement.swiper?.slideTo(idx, 0);
      }
    });

    this.swiperRef.nativeElement.addEventListener('swiperslidechange', () => {
      const swiper = this.swiperRef.nativeElement.swiper;
      if (!swiper) return;
      const idx = swiper.activeIndex;
      if (idx === this.activeIndex) return;
      this.activeIndex = idx;
      const id = DASHBOARDS[idx]?.id;
      if (id) {
        this.router.navigate(['../', id], { relativeTo: this.route, replaceUrl: true });
      }
    });

    // The content box just got shorter by the new header's toolbar; Swiper
    // caches slide heights on init, so re-measure one frame after the
    // header has been laid out. Harmless if the height was already correct.
    requestAnimationFrame(() => this.swiperRef.nativeElement.swiper?.update());
  }

  jumpTo(idx: number) {
    this.swiperRef.nativeElement.swiper?.slideTo(idx);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
