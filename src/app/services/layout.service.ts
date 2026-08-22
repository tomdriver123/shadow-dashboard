import { Injectable } from '@angular/core';
import { Observable, fromEvent, map, startWith, shareReplay } from 'rxjs';

const DESKTOP_QUERY = '(min-width: 768px)';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly isDesktop$: Observable<boolean>;

  constructor() {
    const media = window.matchMedia(DESKTOP_QUERY);
    this.isDesktop$ = fromEvent<MediaQueryListEvent>(media, 'change').pipe(
      map(e => e.matches),
      startWith(media.matches),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
