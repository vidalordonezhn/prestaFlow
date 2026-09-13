import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { DashboardHomeComponent } from './dashboard/dashboard-home/dashboard-home.component';
import { CobrosComponent } from './cobros/cobros.component';
import { LoansComponent } from './loans/loans.component';
import { ClientsComponent } from './clients/clients.component';
import { GarantiasComponent } from './garantias/garantias.component';
import { LoginComponent } from './login/login.component';
import { CashBanksComponent } from './cash-banks/cash-banks.component';
import { PaymentsComponent } from './payments/payments.component';
import { ReportsComponent } from './reports/reports.component';
import { SettingsComponent } from './settings/settings.component';
import { authGuard, loginGuard, adminGuard } from './guards/auth.guard';

export const routes: Routes = [
  { 
    path: 'login', 
    component: LoginComponent, 
    canActivate: [loginGuard] 
  },
  { 
    path: '', 
    component: DashboardComponent, 
    canActivate: [authGuard],
    children: [
      { 
        path: '', 
        component: DashboardHomeComponent 
      },
      { 
        path: 'cobros', 
        component: CobrosComponent 
      },
      { 
        path: 'prestamos', 
        component: LoansComponent 
      },
      { 
        path: 'clientes', 
        component: ClientsComponent 
      },
      { 
        path: 'garantias', 
        component: GarantiasComponent 
      },
      { 
        path: 'pagos', 
        component: PaymentsComponent 
      },
      { 
        path: 'caja-bancos', 
        component: CashBanksComponent,
        canActivate: [adminGuard]
      },
      { 
        path: 'reportes', 
        component: ReportsComponent,
        canActivate: [adminGuard]
      },
      { 
        path: 'configuracion', 
        component: SettingsComponent,
        canActivate: [adminGuard]
      }
    ]
  },
  { 
    path: '**', 
    redirectTo: '' 
  }
];
