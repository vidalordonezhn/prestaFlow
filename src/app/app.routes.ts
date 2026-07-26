import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { LoansComponent } from './loans/loans.component';
import { ClientsComponent } from './clients/clients.component';
import { LoginComponent } from './login/login.component';
import { CashBanksComponent } from './cash-banks/cash-banks.component';
import { PaymentsComponent } from './payments/payments.component';
import { ReportsComponent } from './reports/reports.component';
import { SettingsComponent } from './settings/settings.component';
import { authGuard, loginGuard } from './guards/auth.guard';

export const routes: Routes = [
  { 
    path: 'login', 
    component: LoginComponent,
    canActivate: [loginGuard] 
  },
  { 
    path: '', 
    component: DashboardComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: 'prestamos', 
    component: LoansComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: 'clientes', 
    component: ClientsComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: 'pagos', 
    component: PaymentsComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: 'caja-bancos', 
    component: CashBanksComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: 'reportes', 
    component: ReportsComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: 'configuracion', 
    component: SettingsComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: '**', 
    redirectTo: '' 
  }
];
