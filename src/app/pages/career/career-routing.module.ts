import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
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

// Flat sibling routes (not nested children): Ionic keeps the Career tab
// highlighted at any depth since the stack id is the first segment after
// `tabs`, so drill down pages do not need a second ion-router-outlet.
const routes: Routes = [
  { path: '', component: CareerPage },
  { path: 'applications', component: ApplicationsPage },
  { path: 'applications/:id', component: ApplicationDetailPage },
  { path: 'pipeline', component: PipelinePage },
  { path: 'pipeline/:id', component: PipelineDetailPage },
  { path: 'schedule', component: SchedulePage },
  { path: 'drills', component: DrillsPage },
  { path: 'drills/:id', component: DrillDetailPage },
  { path: 'comms', component: CommsPage },
  { path: 'playbook', component: PlaybookPage },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CareerRoutingModule {}
