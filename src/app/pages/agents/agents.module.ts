import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { AgentsRoutingModule } from './agents-routing.module';
import { AgentsPage } from './agents.page';

@NgModule({
  imports: [CommonModule, IonicModule, AgentsRoutingModule],
  declarations: [AgentsPage],
})
export class AgentsPageModule {}
