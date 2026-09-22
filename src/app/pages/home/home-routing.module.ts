import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeShellPage } from './home.page';

const routes: Routes = [
  { path: ':dashboardId', component: HomeShellPage },
  { path: '', redirectTo: 'pipeline', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HomeRoutingModule {}
