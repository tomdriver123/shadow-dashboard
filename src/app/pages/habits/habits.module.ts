import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { HabitsRoutingModule } from './habits-routing.module';
import { HabitsPage } from './habits.page';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  imports: [CommonModule, IonicModule, HabitsRoutingModule, SharedModule],
  declarations: [HabitsPage],
})
export class HabitsPageModule {}
