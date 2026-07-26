import { Component, signal, computed, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { ApiAuthService } from '../services/api-auth.service';
import { ApiPrestamosService } from '../services/api-prestamos.service';
import { ApiPagosService } from '../services/api-pagos.service';

interface Client {
  id: string;
  loanId?: number;
  name: string;
  phone: string;
  cuota: number;
  pagado: boolean;
  mora: boolean;
  address: string;
  zone: string;
}

interface Payment {
  id: string;
  clientName: string;
  amount: number;
  time: string;
  status: 'Efectivo' | 'Transferencia';
}

interface ChartDay {
  day: string;
  expected: number;
  collected: number;
}

interface Toast {
  id: number;
  type: 'success' | 'info' | 'warning';
  title: string;
  message: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  protected readonly auth = inject(ApiAuthService);
  private readonly router = inject(Router);
  private readonly apiPrestamosService = inject(ApiPrestamosService);
  private readonly apiPagosService = inject(ApiPagosService);

  // Current Date
  protected readonly currentDate = signal(new Date());

  // Sidebar User Dropdown Menu
  protected readonly showUserDropdown = signal<boolean>(false);
  protected readonly showHeaderDropdown = signal<boolean>(false);

  // Search Signal
  protected readonly searchQuery = signal('');

  // Toast Stack Signal
  protected readonly toasts = signal<Toast[]>([]);
  private toastIdCounter = 0;

  // Modal Control Signals
  protected readonly showPaymentModal = signal(false);
  protected readonly selectedClient = signal<Client | null>(null);
  
  // Payment Form Signals
  protected readonly paymentAmount = signal<number>(0);
  protected readonly paymentMethod = signal<'Efectivo' | 'Transferencia'>('Efectivo');

  // Client Data Signal
  protected readonly clients = signal<Client[]>([]);

  // Session Payments (added dynamically by user)
  protected readonly sessionPayments = signal<Payment[]>([]);

  // Base Historical Payments (preloaded)
  protected readonly basePayments = signal<Payment[]>([]);

  // Merge Base and Session payments for display
  protected readonly latestPayments = computed<Payment[]>(() => {
    return [...this.sessionPayments(), ...this.basePayments()];
  });

  // Base financial collection values
  protected readonly metaDelDia = signal(15000);
  protected readonly activePortfolio = signal(384200);
  
  // Session collection accumulator
  protected readonly sessionCollected = signal(0);
  protected readonly baseCollectedToday = signal(8450);

  // Computed KPIs
  protected readonly totalCollectedToday = computed(() => {
    return this.baseCollectedToday() + this.sessionCollected();
  });

  protected readonly arrearsCount = computed(() => {
    // Count clients who are marked as mora and haven't paid yet
    return this.clients().filter(c => c.mora && !c.pagado).length;
  });

  // Filtering Today's Route
  protected readonly filteredClients = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) {
      return this.clients();
    }
    return this.clients().filter(c => 
      c.name.toLowerCase().includes(query) || 
      c.id.includes(query) || 
      c.zone.toLowerCase().includes(query)
    );
  });

  // Chart data: Last 7 days. Today is the last item and updates reactively.
  protected readonly chartDays = computed<ChartDay[]>(() => {
    return [
      { day: 'Lun', expected: 12000, collected: 11500 },
      { day: 'Mar', expected: 13500, collected: 13000 },
      { day: 'Mié', expected: 11000, collected: 9500 },
      { day: 'Jue', expected: 14000, collected: 13800 },
      { day: 'Vie', expected: 15000, collected: 14200 },
      { day: 'Sáb', expected: 8000, collected: 7800 },
      { day: 'Hoy', expected: this.metaDelDia(), collected: this.totalCollectedToday() }
    ];
  });

  // SVG Chart Dimensions & Computations
  protected readonly chartHeight = 180;
  protected readonly chartWidth = 460;
  protected readonly maxChartValue = computed(() => {
    const maxVal = Math.max(...this.chartDays().map(d => Math.max(d.expected, d.collected)));
    return Math.ceil((maxVal * 1.1) / 1000) * 1000; // Add 10% headroom and round to nearest 1000
  });

  // Sidebar Menu Items
  protected readonly menuItems = [
    { name: 'Dashboard', icon: 'dashboard', active: true, route: '/' },
    { name: 'Préstamos', icon: 'currency_exchange', active: false, route: '/prestamos' },
    { name: 'Clientes', icon: 'people', active: false, route: '/clientes' },
    { name: 'Historial de Pagos', icon: 'receipt_long', active: false, route: '/pagos' },
    { name: 'Caja y Bancos', icon: 'account_balance', active: false, route: '/caja-bancos' },
    { name: 'Reportes', icon: 'analytics', active: false, route: '/reportes' },
    { name: 'Configuración', icon: 'settings', active: false, route: '/configuracion' }
  ];

  constructor() {
    // Initial welcome toast
    setTimeout(() => {
      this.triggerToast(
        'info', 
        '¡Bienvenido de nuevo!', 
        'PrestaFlow cargado con éxito. 8 cobros programados para hoy.'
      );
    }, 800);
  }

  // Handle Search Input
  protected onSearchInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.searchQuery.set(inputElement.value);
  }

  ngOnInit(): void {
    this.cargarDatos();
  }

  private cargarDatos(): void {
    console.log('PrestaFlow Dashboard: Iniciando carga de pagos...');
    this.apiPagosService.getPagos().subscribe({
      next: (res) => {
        console.log('PrestaFlow Dashboard: Pagos cargados con éxito:', res);
        const mappedPayments = res.map(p => ({
          id: `TX-${p.id}`,
          clientName: p.clienteNombre,
          amount: p.monto,
          time: new Date(p.fechaPago).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: false }),
          status: p.metodoPago
        }));
        this.sessionPayments.set(mappedPayments);

        const hoy = new Date().toDateString();
        const recolectadoHoy = res
          .filter(p => new Date(p.fechaPago).toDateString() === hoy)
          .reduce((sum, curr) => sum + curr.monto, 0);

        this.sessionCollected.set(recolectadoHoy);
      },
      error: (err) => {
        console.error('PrestaFlow Dashboard: Error al cargar pagos:', err);
        this.triggerToast(
          'warning',
          'Error de Carga',
          `No se pudieron cargar los abonos: ${err.message || err.statusText || 'Error de red'}`
        );
      }
    });

    console.log('PrestaFlow Dashboard: Iniciando carga de préstamos...');
    this.apiPrestamosService.getPrestamos().subscribe({
      next: (resPrestamos) => {
        console.log('PrestaFlow Dashboard: Préstamos cargados con éxito:', resPrestamos);
        this.apiPagosService.getPagos().subscribe({
          next: (resPagos) => {
            console.log('PrestaFlow Dashboard: Pagos de ruta cargados con éxito:', resPagos);
            const hoy = new Date().toDateString();
            const prestamosActivos = resPrestamos.filter(p => p.status === 'Activo' || p.status === 'Mora');
            console.log('PrestaFlow Dashboard: Préstamos activos filtrados para ruta:', prestamosActivos);

            const routeClients = prestamosActivos.map(p => {
              const pagadoHoy = resPagos.some(pago => 
                pago.prestamoId === p.id && 
                new Date(pago.fechaPago).toDateString() === hoy
              );

              return {
                id: p.codigo,
                loanId: p.id,
                name: p.clienteNombre,
                phone: p.clientePhone,
                cuota: p.cuotaMonto,
                pagado: pagadoHoy,
                mora: p.status === 'Mora',
                address: 'Dirección Registrada',
                zone: p.frecuencia === 'Diario' ? 'Ruta Diaria' : p.frecuencia === 'Semanal' ? 'Ruta Semanal' : 'Ruta Mensual'
              };
            });

            console.log('PrestaFlow Dashboard: Clientes de ruta mapeados:', routeClients);
            this.clients.set(routeClients);
          },
          error: (err) => {
            console.error('PrestaFlow Dashboard: Error al cargar pagos secundarios para ruta:', err);
          }
        });
      },
      error: (err) => {
        console.error('PrestaFlow Dashboard: Error al cargar préstamos:', err);
        this.triggerToast(
          'warning',
          'Error de Carga',
          `No se pudieron cargar los préstamos de la ruta: ${err.message || err.statusText || 'Error de red'}`
        );
      }
    });
  }

  // Open Payment Modal
  protected openRegisterPayment(client: Client): void {
    if (client.pagado) return;
    this.selectedClient.set(client);
    this.paymentAmount.set(client.cuota);
    this.paymentMethod.set('Efectivo');
    this.showPaymentModal.set(true);
  }

  // Close Payment Modal
  protected closeRegisterPayment(): void {
    this.showPaymentModal.set(false);
    this.selectedClient.set(null);
  }

  // Submit Payment
  protected submitPayment(): void {
    const client = this.selectedClient();
    if (!client || !client.loanId) return;

    const amountPaid = this.paymentAmount();
    const methodPaid = this.paymentMethod();

    if (amountPaid <= 0) {
      this.triggerToast('warning', 'Monto Inválido', 'El monto a abonar debe ser mayor que cero.');
      return;
    }

    this.apiPagosService.createPago({
      prestamoId: client.loanId,
      monto: amountPaid,
      metodoPago: methodPaid
    }).subscribe({
      next: (res) => {
        this.triggerToast(
          'success',
          'Abono Registrado',
          `Pago de L. ${amountPaid.toLocaleString('es-HN')} de ${client.name} registrado con éxito.`
        );
        this.cargarDatos(); // Refrescar los datos del dashboard de inmediato
        this.closeRegisterPayment();
      },
      error: (err) => {
        const msg = err.error?.mensaje || 'No se pudo registrar el cobro en el sistema.';
        this.triggerToast('warning', 'Error de Operación', msg);
      }
    });
  }

  // Toast Notification Dispatcher
  private triggerToast(type: 'success' | 'info' | 'warning', title: string, message: string): void {
    const id = ++this.toastIdCounter;
    const newToast: Toast = { id, type, title, message };
    
    this.toasts.update(current => [...current, newToast]);

    // Auto-remove toast after 4.5 seconds
    setTimeout(() => {
      this.toasts.update(current => current.filter(t => t.id !== id));
    }, 4500);
  }

  // Remove toast manually on click
  protected removeToast(id: number): void {
    this.toasts.update(current => current.filter(t => t.id !== id));
  }

  protected toggleUserDropdown(event: Event): void {
    event.stopPropagation();
    this.showHeaderDropdown.set(false);
    this.showUserDropdown.update(v => !v);
  }

  protected toggleHeaderDropdown(event: Event): void {
    event.stopPropagation();
    this.showUserDropdown.set(false);
    this.showHeaderDropdown.update(v => !v);
  }

  @HostListener('document:click')
  protected closeUserDropdown(): void {
    this.showUserDropdown.set(false);
    this.showHeaderDropdown.set(false);
  }

  protected onLogout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
