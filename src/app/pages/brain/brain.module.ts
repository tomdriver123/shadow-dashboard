import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { BrainRoutingModule } from './brain-routing.module';
import { BrainPage } from './brain.page';

@NgModule({
  imports: [CommonModule, IonicModule, BrainRoutingModule],
  declarations: [BrainPage],
})
export class BrainPageModule {}
