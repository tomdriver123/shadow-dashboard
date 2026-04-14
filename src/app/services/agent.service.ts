import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Agent } from './agent.model';

@Injectable({
  providedIn: 'root',
})
export class AgentService {
  constructor(private http: HttpClient) {}

  getAgents(): Observable<Agent[]> {
    return this.http.get<Agent[]>('assets/data/agents.json');
  }
}
