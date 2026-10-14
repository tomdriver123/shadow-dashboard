import { Routes } from '@angular/router';
import { PokePage } from './poke.page';

export const POKE_ROUTES: Routes = [
  { path: '', component: PokePage },
  { path: '**', redirectTo: '' },
];
