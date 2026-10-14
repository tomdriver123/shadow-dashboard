import { ChangeDetectionStrategy, Component, input, linkedSignal } from '@angular/core';

@Component({
  selector: 'app-town-image',
  templateUrl: './town-image.html',
  styleUrl: './town-image.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TownImage {
  readonly src = input.required<string | null>();
  readonly alt = input.required<string>();

  protected readonly state = linkedSignal<'loading' | 'loaded' | 'error'>(() =>
    this.src() === null ? 'error' : 'loading',
  );
}
