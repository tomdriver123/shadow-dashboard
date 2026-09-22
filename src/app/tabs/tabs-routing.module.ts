import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'agents',
        loadChildren: () =>
          import('../pages/agents/agents.module').then(m => m.AgentsPageModule),
      },
      {
        path: 'brain',
        redirectTo: 'agents/brain',
        pathMatch: 'full',
      },
      {
        path: 'home',
        loadChildren: () =>
          import('../pages/home/home.module').then(m => m.HomePageModule),
      },
      {
        path: 'habits',
        loadChildren: () =>
          import('../pages/habits/habits.module').then(m => m.HabitsPageModule),
      },
      {
        path: 'feedback',
        data: { feedbackAuthor: 'tom' },
        loadChildren: () =>
          import('../pages/feedback/feedback.module').then(m => m.FeedbackPageModule),
      },
      {
        path: 'career',
        data: { careerScope: 'tom' },
        loadChildren: () =>
          import('../pages/career/career.module').then(m => m.CareerPageModule),
      },
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TabsRoutingModule {}
