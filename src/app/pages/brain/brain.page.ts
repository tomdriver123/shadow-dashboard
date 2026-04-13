import { Component, OnInit } from '@angular/core';
import { BrainService } from '../../services/brain.service';
import {
  BrainData,
  Insight,
  Connection,
  QueueData,
  DOMAIN_COLORS,
  DOMAIN_ICONS,
} from '../../services/brain.model';

type DomainFilter = 'All' | 'Finance' | 'Health' | 'Career' | 'Shadow';
type InsightView = 'cards' | 'list';

@Component({
  selector: 'app-brain',
  templateUrl: './brain.page.html',
  styleUrls: ['./brain.page.scss'],
  standalone: false,
})
export class BrainPage implements OnInit {
  data: BrainData | null = null;
  loading = true;
  error = false;

  domainFilter: DomainFilter = 'All';
  insightView: InsightView = 'cards';
  expandedInsights = new Set<string>();
  expandedConnections = new Set<string>();
  showAllQueue = false;

  readonly domains: DomainFilter[] = ['All', 'Finance', 'Health', 'Career', 'Shadow'];
  readonly domainColors = DOMAIN_COLORS;
  readonly domainIcons = DOMAIN_ICONS;

  constructor(private brainService: BrainService) {}

  ngOnInit() {
    this.brainService.getBrainData().subscribe({
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

  get generatedAt(): string {
    if (!this.data?.generatedAt) return '';
    return new Date(this.data.generatedAt).toLocaleString();
  }

  get queue(): QueueData | null {
    return this.data?.queue ?? null;
  }

  get queueCompletePct(): number {
    if (!this.queue || !this.queue.total) return 0;
    return Math.round((this.queue.done / this.queue.total) * 100);
  }

  get filteredInsights(): Insight[] {
    const insights = this.data?.insights ?? [];
    if (this.domainFilter === 'All') return insights;
    return insights.filter(i => i.domain === this.domainFilter);
  }

  get connections(): Connection[] {
    return this.data?.connections ?? [];
  }

  get domainCounts(): Record<string, number> {
    const all = this.data?.insights ?? [];
    const counts: Record<string, number> = { All: all.length };
    for (const d of ['Finance', 'Health', 'Career', 'Shadow']) {
      counts[d] = all.filter(i => i.domain === d).length;
    }
    return counts;
  }

  get queueItems() {
    const items = this.queue?.items ?? [];
    return this.showAllQueue ? items : items.slice(0, 5);
  }

  toggleInsight(id: string) {
    if (this.expandedInsights.has(id)) {
      this.expandedInsights.delete(id);
    } else {
      this.expandedInsights.add(id);
    }
  }

  isExpanded(id: string): boolean {
    return this.expandedInsights.has(id);
  }

  toggleConnection(id: string) {
    if (this.expandedConnections.has(id)) {
      this.expandedConnections.delete(id);
    } else {
      this.expandedConnections.add(id);
    }
  }

  isConnectionExpanded(id: string): boolean {
    return this.expandedConnections.has(id);
  }

  setDomainFilter(d: DomainFilter) {
    this.domainFilter = d;
  }

  setInsightView(v: InsightView) {
    this.insightView = v;
  }

  priorityLabel(p: number): string {
    if (p >= 5) return 'Critical';
    if (p >= 4) return 'High';
    if (p >= 3) return 'Medium';
    if (p >= 2) return 'Low';
    return 'Info';
  }

  domainColorFor(domain: string): string {
    return DOMAIN_COLORS[domain] ?? '#6b7280';
  }

  domainIconFor(domain: string): string {
    return DOMAIN_ICONS[domain] ?? 'ellipse-outline';
  }

  truncate(text: string | null, len = 180): string {
    if (!text) return '';
    return text.length > len ? text.slice(0, len).replace(/\s+$/, '') + '…' : text;
  }
}
