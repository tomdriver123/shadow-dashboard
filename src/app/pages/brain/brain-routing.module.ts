import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { BrainPage } from './brain.page';

const routes: Routes = [
  {
    path: '',
    component: BrainPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BrainRoutingModule {}
