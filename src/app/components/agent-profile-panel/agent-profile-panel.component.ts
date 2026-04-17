import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Agent } from '../../services/agent.model';

@Component({
  selector: 'app-agent-profile-panel',
  templateUrl: './agent-profile-panel.component.html',
  styleUrls: ['./agent-profile-panel.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class AgentProfilePanelComponent {
  @Input() agent!: Agent;
  @Output() heartbeatClicked = new EventEmitter<void>();
  @Output() newSessionClicked = new EventEmitter<void>();

  get statusColor(): string {
    switch (this.agent.status) {
      case 'active': return 'success';
      case 'paused': return 'warning';
      case 'planned': return 'medium';
      default: return 'medium';
    }
  }
}
