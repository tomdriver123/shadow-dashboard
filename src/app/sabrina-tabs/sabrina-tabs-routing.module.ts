import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SabrinaTabsPage } from './sabrina-tabs.page';

const routes: Routes = [
  {
    path: '',
    component: SabrinaTabsPage,
    children: [
      {
        path: 'career',
        data: { careerScope: 'sabrina' },
        loadChildren: () =>
          import('../pages/career/career.module').then(m => m.CareerPageModule),
      },
      {
        path: 'feedback',
        data: { feedbackAuthor: 'sabrina' },
        loadChildren: () =>
          import('../pages/feedback/feedback.module').then(m => m.FeedbackPageModule),
      },
      {
        path: '',
        redirectTo: 'career',
        pathMatch: 'full',
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SabrinaTabsRoutingModule {}
