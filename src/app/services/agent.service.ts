import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay } from 'rxjs';
import { Agent } from './agent.model';

@Injectable({
  providedIn: 'root',
})
export class AgentService {
  private agents$ = this.http.get<Agent[]>('assets/data/agents.json').pipe(shareReplay(1));

  constructor(private http: HttpClient) {}

  getAgents(): Observable<Agent[]> {
    return this.agents$;
  }

  getAgent(id: string): Observable<Agent | undefined> {
    return this.agents$.pipe(map(agents => agents.find(a => a.id === id)));
  }
}
