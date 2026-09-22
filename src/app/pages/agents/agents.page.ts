import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
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

  constructor(
    private agentService: AgentService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.agentService.getAgents().subscribe(agents => {
      this.agents = agents;
    });
  }

  get shadowAgent(): Agent | undefined {
    return this.agents.find(a => a.id === 'shadow');
  }

  get teamAgents(): Agent[] {
    return this.agents.filter(a => a.id !== 'shadow' && a.status === 'active');
  }

  openChat(agent: Agent): void {
    this.router.navigate(['/chat', agent.id]);
  }

  openBrain(): void {
    this.router.navigate(['/tabs/agents/brain']);
  }
}
