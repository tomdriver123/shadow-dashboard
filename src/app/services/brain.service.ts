import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, shareReplay, switchMap } from 'rxjs';
import { BrainData } from './brain.model';

@Injectable({
  providedIn: 'root',
})
export class BrainService {
  private bust$ = new BehaviorSubject<number>(0);
  private data$ = this.bust$.pipe(
    switchMap((v) => this.http.get<BrainData>(v ? `assets/data/brain.json?v=${v}` : 'assets/data/brain.json')),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor(private http: HttpClient) {}

  getBrainData(): Observable<BrainData> {
    return this.data$;
  }

  refresh(): void {
    this.bust$.next(Date.now());
  }
}
