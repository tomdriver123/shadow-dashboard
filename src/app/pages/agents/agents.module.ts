import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { AgentsRoutingModule } from './agents-routing.module';
import { AgentsPage } from './agents.page';
import { AgentCardComponent } from '../../components/agent-card/agent-card.component';

@NgModule({
  imports: [CommonModule, IonicModule, AgentsRoutingModule],
  declarations: [AgentsPage, AgentCardComponent],
})
export class AgentsPageModule {}
