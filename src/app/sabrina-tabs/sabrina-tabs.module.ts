import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { SabrinaTabsRoutingModule } from './sabrina-tabs-routing.module';
import { SabrinaTabsPage } from './sabrina-tabs.page';

@NgModule({
  imports: [CommonModule, IonicModule, SabrinaTabsRoutingModule],
  declarations: [SabrinaTabsPage],
})
export class SabrinaTabsModule {}
