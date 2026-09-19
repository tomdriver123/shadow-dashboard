import { Component, inject, OnInit } from '@angular/core';
import { CareerService } from '../../../services/career.service';
import { CareerData, ScheduleEvent } from '../../../services/career.model';

interface ScheduleGroup {
  key: string;
  groupDate: string;
  events: ScheduleEvent[];
}

@Component({
  selector: 'app-career-schedule',
  templateUrl: './schedule.page.html',
  styleUrls: ['./schedule.page.scss'],
  standalone: false,
})
export class SchedulePage implements OnInit {
  loading = true;
  error = false;
  data: CareerData | null = null;
  upcomingGroups: ScheduleGroup[] = [];
  pastEventsSorted: ScheduleEvent[] = [];
  earlierExpanded = false;

  private readonly careerService = inject(CareerService);

  ngOnInit(): void {
    this.careerService.getCareerData().subscribe({
      next: (data) => {
        this.data = data;
        this.upcomingGroups = this.groupByDay(data.schedule.upcoming);
        this.pastEventsSorted = [...data.schedule.past].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  toggleEarlier(): void {
    this.earlierExpanded = !this.earlierExpanded;
  }

  // ISO datetime strings carry a 'T'; date only strings ('2026-09-16') do not.
  hasTime(dateStr: string): boolean {
    return dateStr.includes('T');
  }

  private groupByDay(events: ScheduleEvent[]): ScheduleGroup[] {
    const sorted = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const groups: ScheduleGroup[] = [];
    for (const evt of sorted) {
      const key = this.dayKey(evt.date);
      const existing = groups.find((g) => g.key === key);
      if (existing) {
        existing.events.push(evt);
      } else {
        groups.push({ key, groupDate: evt.date, events: [evt] });
      }
    }
    return groups;
  }

  // Local-time day key, matching how the `date` pipe will render group
  // headers and row times (both default to the browser's local timezone).
  private dayKey(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
