import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay } from 'rxjs';
import { FinanceData, Transaction } from './finance.model';

@Injectable({
  providedIn: 'root',
})
export class FinanceService {
  private data$ = this.http.get<FinanceData>('assets/data/finance.json').pipe(shareReplay(1));

  constructor(private http: HttpClient) {}

  getFinanceData(): Observable<FinanceData> {
    return this.data$;
  }

  getRecentTransactions(n: number): Observable<Transaction[]> {
    return this.data$.pipe(
      map(d => d.transactions.filter(t => t.category !== 'income').slice(0, n))
    );
  }
}
