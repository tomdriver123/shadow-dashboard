import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CareerService } from '../../../services/career.service';
import { careerScopeFromRoute } from '../../../services/career-scope';
import { CareerData, CommsEntry } from '../../../services/career.model';

interface WaitingRow {
  company: string;
  summary: string;
  due: string | null;
  link: string | null;
}

@Component({
  selector: 'app-career-comms',
  templateUrl: './comms.page.html',
  styleUrls: ['./comms.page.scss'],
  standalone: false,
})
export class CommsPage implements OnInit {
  loading = true;
  error = false;
  data: CareerData | null = null;

  waitingOnTom: WaitingRow[] = [];
  waitingOnThem: WaitingRow[] = [];
  uniqueCompanies: string[] = [];
  selectedCompany: string | null = null;
  searchText = '';

  private today = new Date().toISOString().slice(0, 10);
  private readonly careerService = inject(CareerService);

  readonly scope = careerScopeFromRoute(inject(ActivatedRoute));

  ngOnInit(): void {
    this.careerService.getCareerData(this.scope).subscribe({
      next: (data) => {
        this.data = data;
        this.waitingOnTom = this.buildWaitingRows(data, 'tom');
        this.waitingOnThem = this.buildWaitingRows(data, 'them');
        this.uniqueCompanies = Array.from(new Set(data.comms.map((c) => c.company))).sort((a, b) =>
          a.localeCompare(b),
        );
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  get filteredComms(): CommsEntry[] {
    let rows = [...(this.data?.comms ?? [])].sort((a, b) => b.date.localeCompare(a.date));
    if (this.selectedCompany) {
      rows = rows.filter((c) => c.company === this.selectedCompany);
    }
    const q = this.searchText.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (c) =>
          c.company.toLowerCase().includes(q) ||
          c.who.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q) ||
          c.channel.toLowerCase().includes(q),
      );
    }
    return rows;
  }

  selectCompany(company: string): void {
    this.selectedCompany = this.selectedCompany === company ? null : company;
  }

  isOverdue(due: string | null): boolean {
    return !!due && due < this.today;
  }

  directionArrow(direction: string): string {
    return direction === 'in' ? '←' : '→';
  }

  directionTitle(direction: string): string {
    return direction === 'in' ? 'Inbound' : 'Outbound';
  }

  private buildWaitingRows(data: CareerData, ball: 'tom' | 'them'): WaitingRow[] {
    const fromPipeline: WaitingRow[] = data.pipeline
      .filter((p) => p.ball === ball)
      .map((p) => ({
        company: p.company ?? 'Unknown company',
        summary: p.nextAction ?? 'No next action logged',
        due: p.nextActionDue,
        link: this.scope.base + '/pipeline/' + p.id,
      }));
    const fromComms: WaitingRow[] = data.comms
      .filter((c) => c.ball === ball)
      .map((c) => ({
        company: c.company,
        summary: c.summary,
        due: c.due,
        link: c.pipelineId ? this.scope.base + '/pipeline/' + c.pipelineId : null,
      }));
    return [...fromPipeline, ...fromComms].sort((a, b) => {
      if (a.due === b.due) return 0;
      if (a.due === null) return 1;
      if (b.due === null) return -1;
      return a.due.localeCompare(b.due);
    });
  }
}
