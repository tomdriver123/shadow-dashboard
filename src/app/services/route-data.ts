import { ActivatedRoute } from '@angular/router';

// Merges `data` from every snapshot in the route's ancestor chain, root
// first, so a lazy parent route's data (e.g. `feedbackAuthor`, `careerScope`)
// reaches a component-less child. Later (deeper) snapshots win on key clash.
export function mergedRouteData(route: ActivatedRoute): Record<string, unknown> {
  return route.snapshot.pathFromRoot.reduce(
    (acc, snapshot) => ({ ...acc, ...snapshot.data }),
    {} as Record<string, unknown>,
  );
}
