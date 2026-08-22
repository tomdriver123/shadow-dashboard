import { Type } from '@angular/core';
import { FinanceDashboardComponent } from './dashboards/finance/finance-dashboard.component';
import { JobsDashboardComponent } from './dashboards/jobs/jobs-dashboard.component';
import { RemindersDashboardComponent } from './dashboards/reminders/reminders-dashboard.component';
import { EmailDashboardComponent } from './dashboards/email/email-dashboard.component';

export interface DashboardDef {
  id: string;
  title: string;
  icon: string;
  component: Type<unknown>;
  hasRealData: boolean;
  issueRef?: string;
}

export const DASHBOARDS: DashboardDef[] = [
  {
    id: 'finance',
    title: 'Finance',
    icon: 'wallet-outline',
    component: FinanceDashboardComponent,
    hasRealData: true,
  },
  {
    id: 'jobs',
    title: 'Job Hunt',
    icon: 'briefcase-outline',
    component: JobsDashboardComponent,
    hasRealData: true,
  },
  {
    id: 'reminders',
    title: 'iOS Reminders',
    icon: 'alarm-outline',
    component: RemindersDashboardComponent,
    hasRealData: false,
    issueRef: '34',
  },
  {
    id: 'email',
    title: 'Email',
    icon: 'mail-outline',
    component: EmailDashboardComponent,
    hasRealData: false,
    issueRef: '35',
  },
];
