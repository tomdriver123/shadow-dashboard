import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  input,
  viewChild,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Town } from '../data/town';
import { POKE_PATH, TOWN_PARAM } from '../poke-paths';
import { PIN_PATH, pinColor } from '../map/pin-colors';
import { amenityEmoji } from './amenity-emoji';
import { TownImage } from './town-image';

@Component({
  selector: 'app-town-panel',
  imports: [RouterLink, TownImage],
  templateUrl: './town-panel.html',
  styleUrl: './town-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TownPanel {
  readonly towns = input.required<Town[]>();
  readonly loading = input.required<boolean>();
  readonly error = input.required<string | null>();
  /** Undefined means list mode. */
  readonly selectedId = input<string>();

  protected readonly amenityEmoji = amenityEmoji;
  protected readonly pinColor = pinColor;
  protected readonly PIN_PATH = PIN_PATH;
  protected readonly pokePath = POKE_PATH;

  /** Query params that open this town on the tab route. */
  protected townQuery(id: string): Record<string, string> {
    return { [TOWN_PARAM]: id };
  }

  protected readonly selected = computed(() => {
    const id = this.selectedId();
    return id === undefined ? undefined : this.towns().find((town) => town.id === id);
  });

  protected readonly title = computed(() => {
    const id = this.selectedId();
    if (id === undefined) {
      return 'Towns';
    }
    const town = this.selected();
    if (town) {
      return town.name;
    }
    return this.loading() || this.error() !== null ? 'Towns' : 'Town not found';
  });

  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');
  private readonly townLinks = viewChildren<ElementRef<HTMLAnchorElement>>('townLink');

  /** The id the focus effect last acted on; plain fields so writing them never re-runs it. */
  private lastFocusedId: string | undefined;
  /** The town whose link gets focus back when the list returns. */
  private lastOpenedId: string | undefined;

  constructor() {
    afterRenderEffect(() => {
      const id = this.selectedId();
      const heading = this.heading();
      const links = this.townLinks();

      if (id !== undefined) {
        // A re-run with the same id (for example a viewChild signal change) must not re-steal focus.
        if (id !== this.lastFocusedId && !this.loading()) {
          heading.nativeElement.focus();
          this.lastFocusedId = id;
          this.lastOpenedId = id;
        }
        return;
      }

      // Back in list mode after a details view: restore focus to the town link.
      if (this.lastFocusedId === undefined) {
        return;
      }
      const link = links.find((ref) => ref.nativeElement.dataset['townId'] === this.lastOpenedId);
      const target = link?.nativeElement ?? heading.nativeElement;
      if (target) {
        target.focus();
        this.lastFocusedId = undefined;
      }
    });
  }
}
