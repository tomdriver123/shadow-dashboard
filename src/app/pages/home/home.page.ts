import { Component, OnInit } from '@angular/core';
import { FinanceService } from '../../services/finance.service';
import { AccountBalance, Transaction, CATEGORY_COLORS } from '../../services/finance.model';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
  balances: AccountBalance[] = [];
  recentTransactions: Transaction[] = [];
  lastUpdated = '';
  loading = true;
  error = false;
  categoryColors = CATEGORY_COLORS;

  constructor(private financeService: FinanceService) {}

  ngOnInit() {
    this.financeService.getFinanceData().subscribe({
      next: (data) => {
        this.balances = data.balances;
        this.recentTransactions = data.transactions
          .filter(t => t.category !== 'income')
          .slice(0, 3);
        this.lastUpdated = data.lastUpdated;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  formatCurrency(amount: number): string {
    return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  truncate(str: string, len: number): string {
    return str.length > len ? str.slice(0, len) + '…' : str;
  }
}
