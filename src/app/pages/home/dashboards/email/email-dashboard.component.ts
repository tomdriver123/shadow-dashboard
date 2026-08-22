import { Component } from '@angular/core';

@Component({
  selector: 'app-email-dashboard',
  templateUrl: './email-dashboard.component.html',
  styleUrls: ['./email-dashboard.component.scss'],
  standalone: false,
})
export class EmailDashboardComponent {
  issueRef = '35';
  get issueUrl(): string {
    return `https://github.com/tomdriver123/shadow/issues/${this.issueRef}`;
  }
}
