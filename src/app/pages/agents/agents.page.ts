import { Component, OnInit } from '@angular/core';
import { AgentService } from '../../services/agent.service';
import { Agent } from '../../services/agent.model';

type Filter = 'All' | 'Active' | 'Paused' | 'Planned';

@Component({
  selector: 'app-agents',
  templateUrl: './agents.page.html',
  styleUrls: ['./agents.page.scss'],
  standalone: false,
})
export class AgentsPage implements OnInit {
  agents: Agent[] = [];
  filters: Filter[] = ['All', 'Active', 'Paused', 'Planned'];
  activeFilter: Filter = 'All';

  constructor(private agentService: AgentService) {}

  ngOnInit() {
    this.agentService.getAgents().subscribe(agents => {
      this.agents = agents;
    });
  }

  setFilter(f: Filter) {
    this.activeFilter = f;
  }

  get filteredAgents(): Agent[] {
    if (this.activeFilter === 'All') return this.agents;
    return this.agents.filter(a => a.status === this.activeFilter.toLowerCase());
  }

  get counts() {
    return {
      active: this.agents.filter(a => a.status === 'active').length,
      paused: this.agents.filter(a => a.status === 'paused').length,
      planned: this.agents.filter(a => a.status === 'planned').length,
    };
  }
}
