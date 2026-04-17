export interface AccountBalance {
  institution: string;
  displayName: string;
  type: 'checking' | 'savings' | 'credit card';
  current: number;
  available: number | null;
}

export interface Transaction {
  date: string;
  amount: number;
  category: string;
  description: string;
}

export interface FinanceData {
  generatedAt: string;
  lastUpdated: string;
  balances: AccountBalance[];
  transactions: Transaction[];
}

export const CATEGORY_COLORS: Record<string, string> = {
  food: '#10b981',
  fitness: '#3b82f6',
  subscriptions: '#8b5cf6',
  pet: '#f59e0b',
  income: '#22c55e',
  transport: '#06b6d4',
  utilities: '#f97316',
  shopping: '#ec4899',
  other: '#6b7280',
};
