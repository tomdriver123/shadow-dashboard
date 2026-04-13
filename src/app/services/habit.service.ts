import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HabitsData } from './habit.model';

@Injectable({
  providedIn: 'root',
})
export class HabitService {
  constructor(private http: HttpClient) {}

  getHabits(): Observable<HabitsData> {
    return this.http.get<HabitsData>('assets/data/habits.json');
  }
}
