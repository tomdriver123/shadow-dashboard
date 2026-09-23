import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { BrainRoutingModule } from './brain-routing.module';
import { BrainPage } from './brain.page';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  imports: [CommonModule, IonicModule, BrainRoutingModule, SharedModule],
  declarations: [BrainPage],
})
export class BrainPageModule {}
