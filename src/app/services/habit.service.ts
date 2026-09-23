import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, shareReplay, switchMap } from 'rxjs';
import { HabitsData } from './habit.model';

@Injectable({
  providedIn: 'root',
})
export class HabitService {
  private bust$ = new BehaviorSubject<number>(0);
  private data$ = this.bust$.pipe(
    switchMap((v) => this.http.get<HabitsData>(v ? `assets/data/habits.json?v=${v}` : 'assets/data/habits.json')),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor(private http: HttpClient) {}

  getHabits(): Observable<HabitsData> {
    return this.data$;
  }

  refresh(): void {
    this.bust$.next(Date.now());
  }
}
