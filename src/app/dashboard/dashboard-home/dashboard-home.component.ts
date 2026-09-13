import { Component, signal, computed, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiAuthService } from '../../services/api-auth.service';
import { ApiPrestamosService } from '../../services/api-prestamos.service';
import { ApiPagosService } from '../../services/api-pagos.service';

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
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-home.component.html',
  styleUrl: './dashboard-home.component.scss'
})
export class DashboardHomeComponent implements OnInit {
  protected readonly Math = Math;
  protected readonly auth = inject(ApiAuthService);
  private readonly apiPrestamosService = inject(ApiPrestamosService);
  private readonly apiPagosService = inject(ApiPagosService);

  // Current Date
  protected readonly currentDate = signal(new Date());

  // Search Signal for clients in route
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

  // List of active loans to retrieve schedules
  protected readonly activeLoansList = signal<any[]>([]);

  // Computed list of pending cuotas for the selected client's loan
  protected readonly selectedLoanPendingCuotas = computed(() => {
    const client = this.selectedClient();
    if (!client || !client.loanId) return [];

    const loan = this.activeLoansList().find(l => l.id === client.loanId);
    if (!loan || !loan.cuotas) return [];

    return loan.cuotas.filter((c: any) => c.estado !== 'Pagado');
  });

  // Session Payments (from database)
  protected readonly sessionPayments = signal<Payment[]>([]);

  // Real Payments for display
  protected readonly latestPayments = computed<Payment[]>(() => {
    return this.sessionPayments().slice(0, 10);
  });

  // Dynamic financial collection values calculated from real data
  protected readonly metaDelDia = computed(() => {
    return this.clients().reduce((sum, c) => sum + c.cuota, 0);
  });

  protected readonly activePortfolio = computed(() => {
    return this.activeLoansList()
      .filter(p => p.status !== 'Pagado')
      .reduce((sum, p) => sum + p.capital, 0);
  });
  
  // Real collection today from DB
  protected readonly sessionCollected = signal(0);

  // Computed KPIs
  protected readonly totalCollectedToday = computed(() => {
    return this.sessionCollected();
  });

  protected readonly arrearsCount = computed(() => {
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
    const meta = this.metaDelDia();
    const cobrado = this.totalCollectedToday();
    return [
      { day: 'Lun', expected: Math.round(meta * 0.9), collected: Math.round(meta * 0.85) },
      { day: 'Mar', expected: Math.round(meta * 1.05), collected: Math.round(meta * 1.0) },
      { day: 'Mié', expected: Math.round(meta * 0.8), collected: Math.round(meta * 0.75) },
      { day: 'Jue', expected: Math.round(meta * 1.1), collected: Math.round(meta * 1.05) },
      { day: 'Vie', expected: Math.round(meta * 1.15), collected: Math.round(meta * 1.1) },
      { day: 'Sáb', expected: Math.round(meta * 0.6), collected: Math.round(meta * 0.58) },
      { day: 'Hoy', expected: meta, collected: cobrado }
    ];
  });

  // SVG Chart Dimensions & Computations
  protected readonly chartHeight = 180;
  protected readonly chartWidth = 460;
  protected readonly maxChartValue = computed(() => {
    const maxVal = Math.max(...this.chartDays().map(d => Math.max(d.expected, d.collected)));
    return Math.ceil((maxVal * 1.1) / 1000) * 1000;
  });

  constructor() {
    setTimeout(() => {
      this.triggerToast(
        'info', 
        '¡Bienvenido de nuevo!', 
        'PrestaFlow cargado con éxito. 8 cobros programados para hoy.'
      );
    }, 800);
  }

  protected onSearchInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.searchQuery.set(inputElement.value);
  }

  ngOnInit(): void {
    this.cargarDatos();
  }

  private cargarDatos(): void {
    this.apiPagosService.getPagos().subscribe({
      next: (res) => {
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
        this.triggerToast(
          'warning',
          'Error de Carga',
          `No se pudieron cargar los abonos: ${err.message || err.statusText || 'Error de red'}`
        );
      }
    });

    this.apiPrestamosService.getPrestamos().subscribe({
      next: (resPrestamos) => {
        this.activeLoansList.set(resPrestamos);
        this.apiPagosService.getPagos().subscribe({
          next: (resPagos) => {
            const hoy = new Date().toDateString();
            const prestamosActivos = resPrestamos.filter(p => p.status === 'Activo' || p.status === 'Mora');

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

            this.clients.set(routeClients);
          },
          error: (err) => {
            console.error('Error al cargar pagos secundarios para ruta:', err);
          }
        });
      },
      error: (err) => {
        this.triggerToast(
          'warning',
          'Error de Carga',
          `No se pudieron cargar los préstamos de la ruta: ${err.message || err.statusText || 'Error de red'}`
        );
      }
    });
  }

  protected openRegisterPayment(client: Client): void {
    if (client.pagado) return;
    this.selectedClient.set(client);
    this.paymentAmount.set(client.cuota);
    this.paymentMethod.set('Efectivo');
    this.showPaymentModal.set(true);
  }

  protected closeRegisterPayment(): void {
    this.showPaymentModal.set(false);
    this.selectedClient.set(null);
  }

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
      next: () => {
        this.triggerToast(
          'success',
          'Abono Registrado',
          `Pago de L. ${amountPaid.toLocaleString('es-HN')} de ${client.name} registrado con éxito.`
        );
        this.cargarDatos();
        this.closeRegisterPayment();
      },
      error: (err) => {
        const msg = err.error?.mensaje || 'No se pudo registrar el cobro en el sistema.';
        this.triggerToast('warning', 'Error de Operación', msg);
      }
    });
  }

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
}
