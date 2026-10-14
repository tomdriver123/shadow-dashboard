/** Route of the Poke Finder tab. */
export const POKE_PATH = '/tabs/poke';

/**
 * The selected town rides on a query param, not a path segment. Ionic's route reuse strategy
 * recreates the page whenever a path param changes, which would rebuild the Leaflet map on every
 * pick; query params leave the same page instance in place. `?town=<id>` still opens a town by URL.
 */
export const TOWN_PARAM = 'town';
