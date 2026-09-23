import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RefreshButtonComponent } from './refresh-button/refresh-button.component';

@NgModule({
  imports: [CommonModule, IonicModule],
  declarations: [RefreshButtonComponent],
  exports: [RefreshButtonComponent],
})
export class SharedModule {}
