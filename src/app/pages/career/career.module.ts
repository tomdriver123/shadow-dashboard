import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { MarkdownModule } from 'ngx-markdown';
import { CareerRoutingModule } from './career-routing.module';
import { CareerPage } from './career.page';
import { ApplicationsPage } from './applications/applications.page';
import { ApplicationDetailPage } from './applications/application-detail.page';
import { PipelinePage } from './pipeline/pipeline.page';
import { PipelineDetailPage } from './pipeline/pipeline-detail.page';
import { SchedulePage } from './schedule/schedule.page';
import { DrillsPage } from './drills/drills.page';
import { DrillDetailPage } from './drills/drill-detail.page';
import { CommsPage } from './comms/comms.page';
import { PlaybookPage } from './playbook/playbook.page';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, MarkdownModule, CareerRoutingModule],
  declarations: [
    CareerPage,
    ApplicationsPage,
    ApplicationDetailPage,
    PipelinePage,
    PipelineDetailPage,
    SchedulePage,
    DrillsPage,
    DrillDetailPage,
    CommsPage,
    PlaybookPage,
  ],
})
export class CareerPageModule {}
