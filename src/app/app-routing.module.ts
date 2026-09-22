import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'tabs',
    loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsModule),
  },
  {
    path: 'chat',
    loadChildren: () => import('./pages/voice/voice.module').then(m => m.VoicePageModule),
  },
  {
    path: 'sabrina',
    loadChildren: () => import('./sabrina-tabs/sabrina-tabs.module').then(m => m.SabrinaTabsModule),
  },
  {
    path: '',
    redirectTo: 'tabs',
    pathMatch: 'full',
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
