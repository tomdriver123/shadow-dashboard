import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BrainData } from './brain.model';

@Injectable({
  providedIn: 'root',
})
export class BrainService {
  constructor(private http: HttpClient) {}

  getBrainData(): Observable<BrainData> {
    return this.http.get<BrainData>('assets/data/brain.json');
  }
}
