import { Component, OnInit } from '@angular/core';
import { AgentService } from '../../services/agent.service';
import { Agent } from '../../services/agent.model';

@Component({
  selector: 'app-agents',
  templateUrl: './agents.page.html',
  styleUrls: ['./agents.page.scss'],
  standalone: false,
})
export class AgentsPage implements OnInit {
  agents: Agent[] = [];

  constructor(private agentService: AgentService) {}

  ngOnInit() {
    this.agentService.getAgents().subscribe(agents => {
      this.agents = agents;
    });
  }

  get shadow(): Agent | undefined {
    return this.agents.find(a => a.id === 'shadow');
  }

  get teamAgents(): Agent[] {
    return this.agents.filter(a => a.id !== 'shadow');
  }
}
