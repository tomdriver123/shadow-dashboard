import { Component, OnInit, inject } from '@angular/core';
import { formatDate } from '@angular/common';
import { CareerService } from '../../../services/career.service';
import { CareerData, ResumeVariant, StrategyDoc } from '../../../services/career.model';

const VARIANT_PAGE_SIZE = 40;

/**
 * Playbook: base resume, searchable resume variant list (~200 entries,
 * capped/paged 40 at a time), strategy docs accordion, lessons learned.
 * Data source: CareerService (assets/data/career.json, generated from the vault).
 */
@Component({
  selector: 'app-career-playbook',
  templateUrl: './playbook.page.html',
  styleUrls: ['./playbook.page.scss'],
  standalone: false,
})
export class PlaybookPage implements OnInit {
  private readonly careerService = inject(CareerService);
  private readonly expandedDocIds = new Set<string>();

  data: CareerData | null = null;
  loading = true;
  error = false;

  resumeExpanded = false;
  search = '';
  visibleVariantCount = VARIANT_PAGE_SIZE;

  ngOnInit(): void {
    this.careerService.getCareerData().subscribe({
      next: (d) => {
        this.data = d;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  get baseResumeMd(): string {
    return this.data?.playbook.baseResumeMd ?? '';
  }

  get variants(): ResumeVariant[] {
    return this.data?.playbook.variants ?? [];
  }

  get docs(): StrategyDoc[] {
    return this.data?.playbook.docs ?? [];
  }

  get lessonsMd(): string {
    return this.data?.playbook.lessonsMd ?? '';
  }

  get filteredVariants(): ResumeVariant[] {
    const q = this.search.trim().toLowerCase();
    let list = this.variants;
    if (q) {
      list = list.filter(
        (v) =>
          v.slug.toLowerCase().includes(q) ||
          v.title.toLowerCase().includes(q) ||
          (v.company ?? '').toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (!a.created && !b.created) return 0;
      if (!a.created) return 1;
      if (!b.created) return -1;
      return b.created.localeCompare(a.created);
    });
  }

  get visibleVariants(): ResumeVariant[] {
    return this.filteredVariants.slice(0, this.visibleVariantCount);
  }

  get hasMoreVariants(): boolean {
    return this.visibleVariantCount < this.filteredVariants.length;
  }

  get remainingVariantsCount(): number {
    return Math.max(0, this.filteredVariants.length - this.visibleVariantCount);
  }

  showMoreVariants(): void {
    this.visibleVariantCount += VARIANT_PAGE_SIZE;
  }

  resetVariantPaging(): void {
    this.visibleVariantCount = VARIANT_PAGE_SIZE;
  }

  isResumeDoc(v: ResumeVariant): boolean {
    return v.docType === 'resume-variant' || v.docType === 'resume-variant-log';
  }

  toggleDoc(id: string): void {
    if (this.expandedDocIds.has(id)) {
      this.expandedDocIds.delete(id);
    } else {
      this.expandedDocIds.add(id);
    }
  }

  isDocExpanded(id: string): boolean {
    return this.expandedDocIds.has(id);
  }

  formatDateOrDash(dateStr: string | null): string {
    if (!dateStr) return '—';
    return formatDate(new Date(`${dateStr}T12:00:00`), 'MMM d', 'en-US');
  }
}
