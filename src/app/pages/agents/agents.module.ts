import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { AgentsRoutingModule } from './agents-routing.module';
import { AgentsPage } from './agents.page';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  imports: [CommonModule, IonicModule, AgentsRoutingModule, SharedModule],
  declarations: [AgentsPage],
})
export class AgentsPageModule {}
