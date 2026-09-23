import { Type } from '@angular/core';
import { FinanceDashboardComponent } from './dashboards/finance/finance-dashboard.component';
import { JobsDashboardComponent } from './dashboards/jobs/jobs-dashboard.component';
import { RemindersDashboardComponent } from './dashboards/reminders/reminders-dashboard.component';
import { EmailDashboardComponent } from './dashboards/email/email-dashboard.component';
import { PipelineDashboardComponent } from './dashboards/pipeline/pipeline-dashboard.component';
import { HabitsTodayDashboardComponent } from './dashboards/habits-today/habits-today-dashboard.component';
import { SystemDashboardComponent } from './dashboards/system/system-dashboard.component';
import { RefreshTarget } from '../../services/refresh.service';

export interface DashboardDef {
  id: string;
  title: string;
  icon: string;
  component: Type<unknown>;
  hasRealData: boolean;
  issueRef?: string;
  refreshTarget?: RefreshTarget;
}

export const DASHBOARDS: DashboardDef[] = [
  {
    id: 'pipeline',
    title: 'Pipeline',
    icon: 'git-branch-outline',
    component: PipelineDashboardComponent,
    hasRealData: true,
    refreshTarget: 'career',
  },
  {
    id: 'finance',
    title: 'Finance',
    icon: 'wallet-outline',
    component: FinanceDashboardComponent,
    hasRealData: true,
    refreshTarget: 'finance',
  },
  {
    id: 'jobs',
    title: 'Job Hunt',
    icon: 'briefcase-outline',
    component: JobsDashboardComponent,
    hasRealData: true,
    refreshTarget: 'jobs',
  },
  {
    id: 'habits',
    title: 'Habits Today',
    icon: 'flame-outline',
    component: HabitsTodayDashboardComponent,
    hasRealData: true,
    refreshTarget: 'habits',
  },
  {
    id: 'system',
    title: 'System',
    icon: 'pulse-outline',
    component: SystemDashboardComponent,
    hasRealData: true,
    refreshTarget: 'all',
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
