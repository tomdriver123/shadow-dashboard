import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { HabitsRoutingModule } from './habits-routing.module';
import { HabitsPage } from './habits.page';

@NgModule({
  imports: [CommonModule, IonicModule, HabitsRoutingModule],
  declarations: [HabitsPage],
})
export class HabitsPageModule {}
