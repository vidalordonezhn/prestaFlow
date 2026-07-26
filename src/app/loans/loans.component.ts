import { Component, OnInit, signal, computed, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { ApiAuthService } from '../services/api-auth.service';
import { SettingsService } from '../services/settings.service';
import { ApiClientsService, ClienteResponse } from '../services/api-clients.service';
import { ApiPrestamosService } from '../services/api-prestamos.service';
import { ApiCajaService, CuentaResponse } from '../services/api-caja.service';

interface Loan {
  id: string;
  clientName: string;
  clientPhone: string;
  startDate: Date;
  capital: number;
  interesPorcentaje: number;
  plazoCuotas: number;
  cuotaMonto: number;
  cuotasPagadas: number;
  status: 'Activo' | 'Pagado' | 'Mora';
  statusDetail: 'Al día' | 'Atrasado' | 'Completado';
  frecuencia: 'Diario' | 'Semanal' | 'Mensual';
}

interface AmortizationItem {
  numeroCuota: number;
  fechaVencimiento: Date;
  monto: number;
  status: 'Pagada' | 'Pendiente' | 'Vencida';
}

interface Toast {
  id: number;
  type: 'success' | 'info' | 'warning';
  title: string;
  message: string;
}

@Component({
  selector: 'app-loans',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './loans.component.html',
  styleUrl: './loans.component.scss'
})
export class LoansComponent implements OnInit {
  protected readonly auth = inject(ApiAuthService);
  protected readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);
  private readonly apiClientsService = inject(ApiClientsService);
  private readonly apiPrestamosService = inject(ApiPrestamosService);
  private readonly apiCajaService = inject(ApiCajaService);

  // Current date
  protected readonly currentDate = signal(new Date());

  // Sidebar User Dropdown Menu
  protected readonly showUserDropdown = signal<boolean>(false);

  // Search and Filter Signals
  protected readonly searchQuery = signal('');
  protected readonly statusFilter = signal<'all' | 'activo' | 'mora' | 'pagado'>('all');

  // Toasts
  protected readonly toasts = signal<Toast[]>([]);
  private toastIdCounter = 0;

  // Modals visibility
  protected readonly showCreateModal = signal(false);
  protected readonly showDetailsModal = signal(false);
  
  // Selected Loan for Detail View
  protected readonly selectedLoan = signal<Loan | null>(null);

  // New Loan Form Signals (Calculator)
  protected readonly availableClients = signal<ClienteResponse[]>([]);
  protected readonly selectedClientId = signal<number | null>(null);
  protected readonly clientSearchQuery = signal('');
  protected readonly isDropdownOpen = signal(false);
  protected readonly availableAccounts = signal<CuentaResponse[]>([]);
  protected readonly selectedAccountId = signal<number>(0);

  protected readonly filteredClientsForSelect = computed(() => {
    const query = this.clientSearchQuery().toLowerCase().trim();
    if (!query) {
      return this.availableClients();
    }
    return this.availableClients().filter(c => 
      c.nombre.toLowerCase().includes(query) || 
      c.identidad.includes(query)
    );
  });

  protected readonly newLendClientName = signal('');
  protected readonly newLendClientPhone = signal('');
  protected readonly newLendAmount = signal<number>(10000);
  protected readonly newInterestRate = signal<number>(10);
  protected readonly newTerm = signal<number>(20);
  protected readonly newFrequency = signal<'Diario' | 'Semanal' | 'Mensual'>('Diario');

  // List of Loans
  protected readonly loans = signal<Loan[]>([]);

  // Sidebar Menu Items
  protected readonly menuItems = [
    { name: 'Dashboard', icon: 'dashboard', active: false, route: '/' },
    { name: 'Préstamos', icon: 'currency_exchange', active: true, route: '/prestamos' },
    { name: 'Clientes', icon: 'people', active: false, route: '/clientes' },
    { name: 'Historial de Pagos', icon: 'receipt_long', active: false, route: '/pagos' },
    { name: 'Caja y Bancos', icon: 'account_balance', active: false, route: '/caja-bancos' },
    { name: 'Reportes', icon: 'analytics', active: false, route: '/reportes' },
    { name: 'Configuración', icon: 'settings', active: false, route: '/configuracion' }
  ];

  // Reactively Calculated KPIs
  protected readonly kpiTotalColocado = computed(() => {
    return this.loans().reduce((acc, curr) => acc + curr.capital, 0);
  });

  protected readonly kpiCapitalPendiente = computed(() => {
    return this.loans().reduce((acc, curr) => {
      if (curr.status === 'Pagado') return acc;
      const totalToPay = curr.cuotaMonto * curr.plazoCuotas;
      const paidToDate = curr.cuotaMonto * curr.cuotasPagadas;
      return acc + (totalToPay - paidToDate);
    }, 0);
  });

  protected readonly kpiInteresGenerado = computed(() => {
    return this.loans().reduce((acc, curr) => {
      const interesMonto = curr.capital * (curr.interesPorcentaje / 100);
      return acc + interesMonto;
    }, 0);
  });

  protected readonly kpiActiveLoansCount = computed(() => {
    return this.loans().filter(l => l.status === 'Activo' || l.status === 'Mora').length;
  });

  // Dynamic Calculator Computations (for modal)
  protected readonly calculatedTotal = computed(() => {
    const amount = this.newLendAmount();
    const interest = this.newInterestRate();
    return amount * (1 + interest / 100);
  });

  protected readonly calculatedInstallment = computed(() => {
    const total = this.calculatedTotal();
    const term = this.newTerm() || 1;
    return Math.round(total / term);
  });

  // Filtered Loans list
  protected readonly filteredLoans = computed(() => {
    let result = this.loans();
    
    // Filter by search query
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      result = result.filter(l => 
        l.clientName.toLowerCase().includes(query) || 
        l.id.toLowerCase().includes(query)
      );
    }

    // Filter by state pills
    const filter = this.statusFilter();
    if (filter !== 'all') {
      if (filter === 'activo') {
        result = result.filter(l => l.status === 'Activo');
      } else if (filter === 'mora') {
        result = result.filter(l => l.status === 'Mora');
      } else if (filter === 'pagado') {
        result = result.filter(l => l.status === 'Pagado');
      }
    }

    return result;
  });

  // Dynamic Amortization Table Generator
  protected readonly amortizationTable = computed<AmortizationItem[]>(() => {
    const loan = this.selectedLoan();
    if (!loan) return [];

    const items: AmortizationItem[] = [];
    const cuotaMonto = loan.cuotaMonto;
    
    for (let i = 1; i <= loan.plazoCuotas; i++) {
      const dueDate = new Date(loan.startDate);
      // Increment days/weeks/months according to frequency
      if (loan.frecuencia === 'Diario') {
        dueDate.setDate(dueDate.getDate() + i);
      } else if (loan.frecuencia === 'Semanal') {
        dueDate.setDate(dueDate.getDate() + (i * 7));
      } else {
        dueDate.setMonth(dueDate.getMonth() + i);
      }

      let status: 'Pagada' | 'Pendiente' | 'Vencida' = 'Pendiente';
      if (i <= loan.cuotasPagadas) {
        status = 'Pagada';
      } else if (dueDate < this.currentDate() && loan.status === 'Mora') {
        status = 'Vencida';
      }

      items.push({
        numeroCuota: i,
        fechaVencimiento: dueDate,
        monto: cuotaMonto,
        status
      });
    }

    return items;
  });

  // Event Handlers
  protected onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  // Open Details Modal
  protected openDetails(loan: Loan): void {
    this.selectedLoan.set(loan);
    this.showDetailsModal.set(true);
  }

  ngOnInit(): void {
    this.cargarClientes();
    this.cargarPrestamos();
    this.cargarCuentas();
    
    // Prefijar interés y frecuencia por defecto desde la configuración
    this.newInterestRate.set(this.settingsService.tasaInteresBase());
    const frecs = this.settingsService.frecuenciasPermitidas();
    if (frecs.length > 0) {
      this.newFrequency.set(frecs[0] as any);
    }
  }

  private cargarClientes(): void {
    this.apiClientsService.getClientes().subscribe({
      next: (res) => this.availableClients.set(res),
      error: () => this.triggerToast('warning', 'Error de Carga', 'No se pudieron obtener los clientes registrados.')
    });
  }

  private cargarPrestamos(): void {
    this.apiPrestamosService.getPrestamos().subscribe({
      next: (res) => {
        const mapped = res.map(p => ({
          id: p.codigo,
          clientName: p.clienteNombre,
          clientPhone: p.clientePhone,
          startDate: new Date(p.fechaOtorgado),
          capital: p.capital,
          interesPorcentaje: p.interesPorcentaje,
          plazoCuotas: p.plazoCuotas,
          cuotaMonto: p.cuotaMonto,
          cuotasPagadas: p.cuotasPagadas,
          status: p.status,
          statusDetail: p.status === 'Pagado' ? 'Completado' as const : p.status === 'Mora' ? 'Atrasado' as const : 'Al día' as const,
          frecuencia: p.frecuencia
        }));
        this.loans.set(mapped);
      },
      error: () => this.triggerToast('warning', 'Error de Carga', 'No se pudieron obtener los préstamos de la base de datos.')
    });
  }

  private cargarCuentas(): void {
    this.apiCajaService.getCuentas().subscribe({
      next: (res) => {
        this.availableAccounts.set(res);
        if (res.length > 0) {
          this.selectedAccountId.set(res[0].id);
        }
      }
    });
  }

  protected onDisbursementAccountChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.selectedAccountId.set(Number(val));
  }

  protected onSearchInputChange(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.clientSearchQuery.set(val);
    this.isDropdownOpen.set(true);

    // Si borra el texto, limpiar la selección
    if (!val.trim()) {
      this.selectedClientId.set(null);
      this.newLendClientName.set('');
      this.newLendClientPhone.set('');
    }
  }

  protected selectClient(client: ClienteResponse): void {
    this.selectedClientId.set(client.id);
    this.newLendClientName.set(client.nombre);
    this.clientSearchQuery.set(client.nombre);
    this.newLendClientPhone.set(client.phone);
    this.isDropdownOpen.set(false);
  }

  protected onSearchBlur(): void {
    // Un pequeño retraso para permitir registrar el click en la opción
    setTimeout(() => {
      this.isDropdownOpen.set(false);
      const selected = this.availableClients().find(c => c.id === this.selectedClientId());
      if (selected) {
        this.clientSearchQuery.set(selected.nombre);
      } else {
        this.clientSearchQuery.set('');
        this.selectedClientId.set(null);
        this.newLendClientName.set('');
        this.newLendClientPhone.set('');
      }
    }, 200);
  }

  // Open Create Modal (Initializes form variables)
  protected openCreateLoan(): void {
    this.selectedClientId.set(null);
    this.clientSearchQuery.set('');
    this.newLendClientName.set('');
    this.newLendClientPhone.set('');
    this.newLendAmount.set(10000);
    this.newInterestRate.set(10);
    this.newTerm.set(20);
    this.newFrequency.set('Diario');
    this.cargarCuentas(); // Refrescar cuentas de desembolso
    this.showCreateModal.set(true);
  }

  // Submit New Loan Form
  protected submitLoan(): void {
    const clientId = this.selectedClientId();
    const amount = this.newLendAmount();
    const interest = this.newInterestRate();
    const term = this.newTerm();
    const frequency = this.newFrequency();
    const accountId = this.selectedAccountId();

    if (!clientId) {
      this.triggerToast('warning', 'Cliente Requerido', 'Debe seleccionar un cliente de la lista flotante.');
      return;
    }

    if (!accountId) {
      this.triggerToast('warning', 'Cuenta Requerida', 'Debe seleccionar una cuenta de desembolso.');
      return;
    }

    if (amount <= 0 || interest < 0 || term <= 0) {
      this.triggerToast('warning', 'Valores Inválidos', 'Monto, interés y plazo deben ser mayores a cero.');
      return;
    }

    this.apiPrestamosService.createPrestamo({
      clienteId: clientId,
      capital: amount,
      interesPorcentaje: interest,
      plazoCuotas: term,
      frecuencia: frequency,
      cuentaDesembolsoId: accountId
    }).subscribe({
      next: (res) => {
        this.triggerToast(
          'success',
          'Préstamo Otorgado',
          `Préstamo ${res.codigo} de L. ${amount.toLocaleString('es-HN')} otorgado a ${res.clienteNombre} con éxito.`
        );
        this.cargarPrestamos(); // Recargar préstamos desde base de datos
        this.showCreateModal.set(false);
      },
      error: (err) => {
        const msg = err.error?.mensaje || 'No se pudo otorgar el préstamo en el sistema.';
        this.triggerToast('warning', 'Error de Operación', msg);
      }
    });
  }

  // Toasts
  private triggerToast(type: 'success' | 'info' | 'warning', title: string, message: string): void {
    const id = ++this.toastIdCounter;
    const newToast: Toast = { id, type, title, message };
    
    this.toasts.update(current => [...current, newToast]);

    setTimeout(() => {
      this.toasts.update(current => current.filter(t => t.id !== id));
    }, 4500);
  }

  protected removeToast(id: number): void {
    this.toasts.update(current => current.filter(t => t.id !== id));
  }

  protected toggleUserDropdown(event: Event): void {
    event.stopPropagation();
    this.showUserDropdown.update(v => !v);
  }

  @HostListener('document:click')
  protected closeUserDropdown(): void {
    this.showUserDropdown.set(false);
  }

  protected onLogout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
