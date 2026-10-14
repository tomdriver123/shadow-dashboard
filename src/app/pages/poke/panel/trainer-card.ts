import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { GameData } from '../data/game';
import { typeColor } from './type-colors';

@Component({
  selector: 'app-trainer-card',
  templateUrl: './trainer-card.html',
  styleUrl: './trainer-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainerCard {
  readonly game = input.required<GameData | null>();

  protected readonly typeColor = typeColor;

  protected clampPercent(progress: number | null | undefined): number {
    const value = typeof progress === 'number' && Number.isFinite(progress) ? progress : 0;
    return Math.max(0, Math.min(1, value)) * 100;
  }
}
