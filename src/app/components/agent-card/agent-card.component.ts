import { Component, Input } from '@angular/core';
import { Agent } from '../../services/agent.model';

@Component({
  selector: 'app-agent-card',
  templateUrl: './agent-card.component.html',
  styleUrls: ['./agent-card.component.scss'],
  standalone: false,
})
export class AgentCardComponent {
  @Input() agent!: Agent;
}
