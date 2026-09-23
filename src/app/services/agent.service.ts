import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, map, shareReplay, switchMap } from 'rxjs';
import { Agent } from './agent.model';

@Injectable({
  providedIn: 'root',
})
export class AgentService {
  private bust$ = new BehaviorSubject<number>(0);
  private agents$ = this.bust$.pipe(
    switchMap((v) => this.http.get<Agent[]>(v ? `assets/data/agents.json?v=${v}` : 'assets/data/agents.json')),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor(private http: HttpClient) {}

  getAgents(): Observable<Agent[]> {
    return this.agents$;
  }

  getAgent(id: string): Observable<Agent | undefined> {
    return this.agents$.pipe(map(agents => agents.find(a => a.id === id)));
  }

  refresh(): void {
    this.bust$.next(Date.now());
  }
}
