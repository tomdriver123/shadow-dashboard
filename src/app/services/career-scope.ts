import { ActivatedRoute, ActivatedRouteSnapshot } from '@angular/router';

export type CareerPerson = 'tom' | 'sabrina';

export interface CareerScope {
  person: CareerPerson;
  displayName: string;
  base: '/tabs/career' | '/sabrina/career';
  dataUrl: string;
  features: { drills: boolean; kb: boolean; linkedinViews: boolean; menuButton: boolean; queueVerdict: boolean; queueVerdictNote: boolean };
}

export const CAREER_SCOPES: Record<CareerPerson, CareerScope> = {
  tom: { person: 'tom', displayName: 'Tom', base: '/tabs/career', dataUrl: 'assets/data/career.json',
         features: { drills: true, kb: true, linkedinViews: true, menuButton: true, queueVerdict: true, queueVerdictNote: false } },
  sabrina: { person: 'sabrina', displayName: 'Sabrina', base: '/sabrina/career', dataUrl: 'assets/data/career-sabrina.json',
             features: { drills: false, kb: false, linkedinViews: false, menuButton: false, queueVerdict: true, queueVerdictNote: true } },
};

/** Walks the snapshot chain so the scope resolves regardless of paramsInheritanceStrategy. */
export function careerScopeFromRoute(route: ActivatedRoute): CareerScope {
  for (let r: ActivatedRouteSnapshot | null = route.snapshot; r; r = r.parent) {
    const p = r.data?.['careerScope'];
    if (p === 'tom' || p === 'sabrina') return CAREER_SCOPES[p as CareerPerson];
  }
  return CAREER_SCOPES.tom;
}
