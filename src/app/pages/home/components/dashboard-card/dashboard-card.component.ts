import { Component, Input } from '@angular/core';

@Component({
  selector: 'sh-dashboard-card',
  templateUrl: './dashboard-card.component.html',
  styleUrls: ['./dashboard-card.component.scss'],
  standalone: false,
})
export class DashboardCardComponent {
  @Input() title = '';
}
