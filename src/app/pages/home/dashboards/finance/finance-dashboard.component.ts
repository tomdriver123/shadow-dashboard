import { Component, OnInit } from '@angular/core';
import { FinanceService } from '../../../../services/finance.service';
import { AccountBalance, Transaction, CATEGORY_COLORS } from '../../../../services/finance.model';

/** One category's month to date spend, for the "This month" card's bars. */
interface CategoryTotal {
  category: string;
  total: number;
  color: string;
}

@Component({
  selector: 'app-finance-dashboard',
  templateUrl: './finance-dashboard.component.html',
  styleUrls: ['./finance-dashboard.component.scss'],
  standalone: false,
})
export class FinanceDashboardComponent implements OnInit {
  balances: AccountBalance[] = [];
  recentTransactions: Transaction[] = [];
  lastUpdated = '';
  loading = true;
  error = false;
  categoryColors = CATEGORY_COLORS;

  monthSpend = 0;
  topCategories: CategoryTotal[] = [];
  failingAccounts: AccountBalance[] = [];

  constructor(private financeService: FinanceService) {}

  ngOnInit() {
    this.financeService.getFinanceData().subscribe({
      next: (data) => {
        this.balances = data.balances;
        this.recentTransactions = data.transactions
          .filter(t => t.category !== 'income')
          .slice(0, 3);
        this.lastUpdated = data.lastUpdated;
        this.failingAccounts = data.balances.filter(b => b.status === 'error');

        // Local month key, not toISOString: UTC would roll the month over
        // early in the evening for a US timezone.
        const d = new Date();
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthTxns = data.transactions.filter(
          t => t.date.startsWith(monthKey) && t.category !== 'income'
        );

        this.monthSpend = monthTxns.reduce((sum, t) => sum + t.amount, 0);

        const totalsByCategory = new Map<string, number>();
        for (const t of monthTxns) {
          totalsByCategory.set(t.category, (totalsByCategory.get(t.category) ?? 0) + t.amount);
        }
        this.topCategories = [...totalsByCategory.entries()]
          .map(([category, total]) => ({
            category,
            total,
            color: CATEGORY_COLORS[category] ?? CATEGORY_COLORS['other'],
          }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 3);

        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  formatCurrency(amount: number | null): string {
    if (amount === null) return '—';
    return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  truncate(str: string, len: number): string {
    return str.length > len ? str.slice(0, len) + '…' : str;
  }

  /** Bar width as a percentage of the largest of the top three categories. */
  barWidth(c: CategoryTotal): number {
    const max = this.topCategories[0]?.total || 1;
    return Math.round((c.total / max) * 100);
  }
}
