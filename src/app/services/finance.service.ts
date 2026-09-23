import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, map, shareReplay, switchMap } from 'rxjs';
import { FinanceData, Transaction } from './finance.model';

@Injectable({
  providedIn: 'root',
})
export class FinanceService {
  private bust$ = new BehaviorSubject<number>(0);
  private data$ = this.bust$.pipe(
    switchMap((v) => this.http.get<FinanceData>(v ? `assets/data/finance.json?v=${v}` : 'assets/data/finance.json')),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor(private http: HttpClient) {}

  getFinanceData(): Observable<FinanceData> {
    return this.data$;
  }

  getRecentTransactions(n: number): Observable<Transaction[]> {
    return this.data$.pipe(
      map(d => d.transactions.filter(t => t.category !== 'income').slice(0, n))
    );
  }

  refresh(): void {
    this.bust$.next(Date.now());
  }
}
