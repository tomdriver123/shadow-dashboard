import { Component, Input } from '@angular/core';
import { RefreshTarget } from '../../../../services/refresh.service';

@Component({
  selector: 'sh-dashboard-card',
  templateUrl: './dashboard-card.component.html',
  styleUrls: ['./dashboard-card.component.scss'],
  standalone: false,
})
export class DashboardCardComponent {
  @Input() title = '';
  @Input() refreshTarget?: RefreshTarget;
  @Input() generatedAt: string | null = null;
}
