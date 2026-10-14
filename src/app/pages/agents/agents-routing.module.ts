import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AgentsPage } from './agents.page';

// Flat sibling route (not a child): Ionic keeps the Agents tab highlighted
// at this depth since the stack id is the first segment after `tabs`,
// mirroring the pattern in pages/career/career-routing.module.ts.
const routes: Routes = [
  {
    path: '',
    component: AgentsPage,
  },
  {
    path: 'brain',
    loadChildren: () => import('../brain/brain.module').then(m => m.BrainPageModule),
  },
  {
    path: 'feedback',
    data: { feedbackAuthor: 'tom' },
    loadChildren: () => import('../feedback/feedback.module').then(m => m.FeedbackPageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AgentsRoutingModule {}
