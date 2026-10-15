import { ActivatedRoute, ActivatedRouteSnapshot } from '@angular/router';

export type CareerPerson = 'tom' | 'sabrina';

export interface CareerScope {
  person: CareerPerson;
  /** Fallback only (the capitalised scope id); prefer careerDisplayName(scope, data) once the payload is loaded. */
  displayName: string;
  base: '/tabs/career' | '/sabrina/career';
  dataUrl: string;
  features: { drills: boolean; kb: boolean; linkedinViews: boolean; menuButton: boolean; queueVerdict: boolean; queueVerdictNote: boolean; queuePreview: boolean };
}

const capitalise = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1);

export const CAREER_SCOPES: Record<CareerPerson, CareerScope> = {
  tom: { person: 'tom', displayName: capitalise('tom'), base: '/tabs/career', dataUrl: 'assets/data/career.json',
         features: { drills: true, kb: true, linkedinViews: true, menuButton: true, queueVerdict: true, queueVerdictNote: false, queuePreview: false } },
  sabrina: { person: 'sabrina', displayName: capitalise('sabrina'), base: '/sabrina/career', dataUrl: 'assets/data/career-sabrina.json',
             features: { drills: false, kb: false, linkedinViews: false, menuButton: false, queueVerdict: true, queueVerdictNote: true, queuePreview: true } },
};

/** The scope's display name: the generated payload's context.displayName when it has one, else the capitalised scope id. */
export function careerDisplayName(scope: CareerScope, data?: { context?: { displayName?: string | null } | null } | null): string {
  return data?.context?.displayName || scope.displayName;
}

/** Walks the snapshot chain so the scope resolves regardless of paramsInheritanceStrategy. */
export function careerScopeFromRoute(route: ActivatedRoute): CareerScope {
  for (let r: ActivatedRouteSnapshot | null = route.snapshot; r; r = r.parent) {
    const p = r.data?.['careerScope'];
    if (p === 'tom' || p === 'sabrina') return CAREER_SCOPES[p as CareerPerson];
  }
  return CAREER_SCOPES.tom;
}
