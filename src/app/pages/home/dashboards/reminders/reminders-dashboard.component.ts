import { Component } from '@angular/core';

@Component({
  selector: 'app-reminders-dashboard',
  templateUrl: './reminders-dashboard.component.html',
  styleUrls: ['./reminders-dashboard.component.scss'],
  standalone: false,
})
export class RemindersDashboardComponent {
  issueRef = '34';
  get issueUrl(): string {
    return `https://github.com/tomdriver123/shadow/issues/${this.issueRef}`;
  }
}
