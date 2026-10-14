import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  LatLngBounds,
  LeafletKeyboardEvent,
  Map as LeafletMap,
  CRS,
  control,
  Marker,
  Polyline,
  divIcon,
  latLng,
  latLngBounds,
  map,
  marker,
  polyline,
} from 'leaflet';
import { Town } from '../data/town';
import { GRID_HEIGHT, GRID_MARGIN, GRID_WIDTH, gridToLatLng } from './kanto';
import { PIN_PATH, pinColor } from './pin-colors';

/** Zoom for a selected town. CRS.Simple makes one grid unit 2^zoom px: 32px at 5. */
export const ZOOM = 5;
const MIN_ZOOM = 3;
const MAX_ZOOM = 7;

const SELECTED_Z_OFFSET = 1000;

interface CameraRequest {
  leafletMap: LeafletMap;
  markers: Map<string, Marker>;
  selected: Marker | undefined;
  offset: number;
}

/** The grid plus a margin. The mobile sheet covers the south, so that edge grows by its height. */
function gridBounds(extraSouth: number): LatLngBounds {
  return latLngBounds(
    latLng(-(GRID_HEIGHT + GRID_MARGIN + extraSouth), -GRID_MARGIN),
    latLng(GRID_MARGIN, GRID_WIDTH + GRID_MARGIN),
  );
}

const pinIcon = divIcon({
  className: 'town-pin',
  html:
    '<svg aria-hidden="true" width="28" height="40" viewBox="0 0 28 40">' +
    `<path fill="currentColor" d="${PIN_PATH}"/>` +
    '</svg>',
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  tooltipAnchor: [0, -36],
});

@Component({
  selector: 'app-town-map',
  templateUrl: './town-map.html',
  styleUrl: './town-map.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'town-map' },
})
export class TownMap {
  readonly towns = input.required<Town[]>();
  readonly routes = input<[string, string][]>([]);
  readonly selectedId = input<string | undefined>();
  readonly centerOffset = input(0);
  /** A change refits the map to every town when nothing is selected (the Recenter button). */
  readonly fitRequest = input(0);
  readonly select = output<string>();

  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly leafletMap = signal<LeafletMap | undefined>(undefined);
  private readonly markers = signal<Map<string, Marker>>(new Map());
  private selectedMarker: Marker | undefined;
  /** The bottom sheet height in px that the latest camera request reserved. */
  private sheetOffset = 0;
  /** True only while a Leaflet zoom animation runs; set and cleared by zoomstart and zoomend. */
  private zooming = false;
  /** The latest camera request, held until a running zoom animation ends. */
  private pending: CameraRequest | undefined;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const leafletMap = map(this.container().nativeElement, {
        crs: CRS.Simple,
        attributionControl: false,
        zoomControl: false,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        maxBounds: gridBounds(0),
        maxBoundsViscosity: 0.8,
      });
      // Leaflet drops camera calls made mid-animation, so hold the latest one until zoomend.
      // These handlers touch only Leaflet and plain fields, so no signal write is needed.
      leafletMap.on('zoomstart', () => {
        this.zooming = true;
      });
      leafletMap.on('zoomend', () => {
        this.zooming = false;
        leafletMap.setMaxBounds(gridBounds(this.sheetOffset / Math.pow(2, leafletMap.getZoom())));
        const request = this.pending;
        this.pending = undefined;
        if (request) {
          this.applyCamera(request);
        }
      });
      control.zoom({ position: 'topright' }).addTo(leafletMap);
      leafletMap.invalidateSize();

      const observer =
        typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver(() => leafletMap.invalidateSize())
          : undefined;
      observer?.observe(this.host.nativeElement);

      destroyRef.onDestroy(() => {
        observer?.disconnect();
        leafletMap.remove();
      });
      this.leafletMap.set(leafletMap);
    });

    effect((onCleanup) => {
      const leafletMap = this.leafletMap();
      if (!leafletMap) {
        return;
      }
      const markers = this.buildMarkers(leafletMap, this.towns());
      this.markers.set(markers);
      onCleanup(() => markers.forEach((m) => m.remove()));
    });

    effect((onCleanup) => {
      const leafletMap = this.leafletMap();
      if (!leafletMap) {
        return;
      }
      const lines = this.buildRoutes(this.towns(), this.routes());
      lines.forEach((line) => line.addTo(leafletMap));
      onCleanup(() => lines.forEach((line) => line.remove()));
    });

    effect(() => {
      const leafletMap = this.leafletMap();
      const markers = this.markers();
      const selected = markers.get(this.selectedId() ?? '');
      const offset = this.centerOffset();
      this.fitRequest();
      if (!leafletMap || markers.size === 0) {
        return;
      }
      this.moveCamera({ leafletMap, markers, selected, offset });
      this.markSelected(selected);
    });
  }

  private buildMarkers(leafletMap: LeafletMap, towns: Town[]): Map<string, Marker> {
    const markers = new Map<string, Marker>();
    // The index counts every town, including those without a grid position, so the list agrees.
    for (const [index, town] of towns.entries()) {
      if (!town.grid) {
        continue;
      }
      const label = document.createElement('span');
      label.textContent = town.name;
      const m = marker(gridToLatLng(town.grid), {
        icon: pinIcon,
        title: town.name,
        alt: town.name,
        keyboard: true,
      }).bindTooltip(label, { direction: 'top' });
      // Leaflet adds a marker only once the map has a view, so the element is labelled on add.
      m.on('add', () => {
        const element = m.getElement();
        element?.setAttribute('aria-label', town.name);
        if (element) {
          element.style.color = pinColor(index);
        }
      });
      m.on('click', () => this.select.emit(town.id));
      // Leaflet maps Enter to click only for markers with a popup, so handle Enter and Space here.
      m.on('keypress', (e: LeafletKeyboardEvent) => {
        const event = e.originalEvent;
        const space = event.key === ' ' || event.keyCode === 32;
        if (space) {
          event.preventDefault(); // keeps the page from scrolling
        }
        if (space || event.keyCode === 13) {
          this.select.emit(town.id);
        }
      });
      m.addTo(leafletMap);
      markers.set(town.id, m);
    }
    return markers;
  }

  private buildRoutes(towns: Town[], routes: [string, string][]): Polyline[] {
    const byId = new Map<string, Town>();
    towns.forEach((town) => byId.set(town.id, town));
    const lines: Polyline[] = [];
    for (const [from, to] of routes) {
      const a = byId.get(from)?.grid;
      const b = byId.get(to)?.grid;
      if (!a || !b) {
        continue;
      }
      lines.push(
        polyline([gridToLatLng(a), gridToLatLng(b)], {
          className: 'town-route',
          weight: 3,
          interactive: false,
        }),
      );
    }
    return lines;
  }

  private moveCamera(request: CameraRequest): void {
    this.pending = request;
    if (this.zooming) {
      return;
    }
    this.pending = undefined;
    this.applyCamera(request);
  }

  private applyCamera({ leafletMap, markers, selected, offset }: CameraRequest): void {
    // Loosen the south edge by the sheet height at the lowest zoom so the grid can sit above
    // the sheet; zoomend tightens it to the real zoom.
    this.sheetOffset = offset;
    leafletMap.setMaxBounds(gridBounds(offset / Math.pow(2, MIN_ZOOM)));
    const animate = !(
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
    if (selected) {
      const point = leafletMap.project(selected.getLatLng(), ZOOM).add([0, offset / 2]);
      leafletMap.setView(leafletMap.unproject(point, ZOOM), ZOOM, { animate });
    } else {
      const bounds = latLngBounds([...markers.values()].map((m) => m.getLatLng()));
      // animate: false because Leaflet drops fitBounds/setView calls that land while a zoom
      // animation is running (_tryAnimatedZoom returns true while _animatingZoom is set), which
      // left the map zoomed out after the sheet resized. List <-> town moves never animated
      // anyway: the zoom change exceeds Leaflet's 4-level zoomAnimationThreshold.
      leafletMap.fitBounds(bounds, {
        paddingTopLeft: [24, 64],
        paddingBottomRight: [24, 24 + offset],
        maxZoom: ZOOM,
        animate: false,
      });
    }
  }

  private markSelected(selected: Marker | undefined): void {
    if (this.selectedMarker && this.selectedMarker !== selected) {
      this.selectedMarker.getElement()?.classList.remove('is-selected');
      this.selectedMarker.getElement()?.removeAttribute('aria-current');
      this.selectedMarker.setZIndexOffset(0);
    }
    selected?.getElement()?.classList.add('is-selected');
    selected?.getElement()?.setAttribute('aria-current', 'true');
    selected?.setZIndexOffset(SELECTED_Z_OFFSET);
    this.selectedMarker = selected;
  }
}
