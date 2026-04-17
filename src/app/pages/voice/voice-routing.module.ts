import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { VoicePage } from './voice.page';

const routes: Routes = [
  {
    path: ':agentId',
    component: VoicePage,
  },
  {
    path: '',
    redirectTo: 'shadow',
    pathMatch: 'full',
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class VoiceRoutingModule {}
