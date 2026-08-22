import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { HomeRoutingModule } from './home-routing.module';
import { HomeShellPage } from './home.page';
import { DashboardCardComponent } from './components/dashboard-card/dashboard-card.component';
import { FinanceDashboardComponent } from './dashboards/finance/finance-dashboard.component';
import { RemindersDashboardComponent } from './dashboards/reminders/reminders-dashboard.component';
import { EmailDashboardComponent } from './dashboards/email/email-dashboard.component';

@NgModule({
  imports: [CommonModule, IonicModule, HomeRoutingModule],
  declarations: [
    HomeShellPage,
    DashboardCardComponent,
    FinanceDashboardComponent,
    RemindersDashboardComponent,
    EmailDashboardComponent,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class HomePageModule {}
