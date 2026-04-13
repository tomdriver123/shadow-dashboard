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
        loadChildren: () =>
          import('../pages/brain/brain.module').then(m => m.BrainPageModule),
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
        path: '',
        redirectTo: 'agents',
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
