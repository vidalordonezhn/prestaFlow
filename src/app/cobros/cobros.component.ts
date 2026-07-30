import { Component, signal, computed, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { ApiAuthService } from '../services/api-auth.service';
import { ApiPrestamosService } from '../services/api-prestamos.service';
import { ApiPagosService } from '../services/api-pagos.service';
import { SettingsService } from '../services/settings.service';

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

interface Toast {
  id: number;
  type: 'success' | 'info' | 'warning';
  title: string;
  message: string;
}

@Component({
  selector: 'app-cobros',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './cobros.component.html',
  styleUrl: './cobros.component.scss'
})
export class CobrosComponent implements OnInit {
  protected readonly auth = inject(ApiAuthService);
  protected readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);
  private readonly apiPrestamosService = inject(ApiPrestamosService);
  private readonly apiPagosService = inject(ApiPagosService);

  // Current Date
  protected readonly currentDate = signal(new Date());

  // Sidebar User Dropdown Menu
  protected readonly showUserDropdown = signal<boolean>(false);

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

  // Receipt Modal Control Signals
  protected readonly showReceiptModal = signal(false);
  protected readonly selectedPayment = signal<any | null>(null);

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

  // Sidebar Menu Items
  protected readonly menuItems = [
    { name: 'Dashboard', icon: 'dashboard', active: false, route: '/' },
    { name: 'Cobros de Hoy', icon: 'route', active: true, route: '/cobros' },
    { name: 'Préstamos', icon: 'currency_exchange', active: false, route: '/prestamos' },
    { name: 'Clientes', icon: 'people', active: false, route: '/clientes' },
    { name: 'Historial de Pagos', icon: 'receipt_long', active: false, route: '/pagos' },
    { name: 'Caja y Bancos', icon: 'account_balance', active: false, route: '/caja-bancos' },
    { name: 'Reportes', icon: 'analytics', active: false, route: '/reportes' },
    { name: 'Configuración', icon: 'settings', active: false, route: '/configuracion' }
  ];

  // Handle Search Input
  protected onSearchInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.searchQuery.set(inputElement.value);
  }

  ngOnInit(): void {
    this.cargarDatos();
  }

  protected cargarDatos(): void {
    console.log('PrestaFlow Cobros: Iniciando carga de préstamos...');
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
            console.error('PrestaFlow Cobros: Error al cargar pagos:', err);
          }
        });
      },
      error: (err) => {
        console.error('PrestaFlow Cobros: Error al cargar préstamos:', err);
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
        this.cargarDatos(); // Refrescar cobros
        this.closeRegisterPayment();

        // Immediately trigger the receipt modal for this payment!
        this.selectedPayment.set(res);
        this.showReceiptModal.set(true);
      },
      error: (err) => {
        const msg = err.error?.mensaje || 'No se pudo registrar el cobro en el sistema.';
        this.triggerToast('warning', 'Error de Operación', msg);
      }
    });
  }

  // Close Receipt Modal
  protected closeReceipt(): void {
    this.showReceiptModal.set(false);
    this.selectedPayment.set(null);
  }

  // Share Receipt on WhatsApp
  protected shareOnWhatsApp(payment: any): void {
    if (!payment) return;
    const cleanPhone = payment.clientePhone.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.startsWith('504') ? cleanPhone : `504${cleanPhone}`;
    
    const dateFormatted = new Date(payment.fechaPago).toLocaleDateString('es-HN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timeFormatted = new Date(payment.fechaPago).toLocaleTimeString('es-HN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    
    const message = `Hola *${payment.clienteNombre}*, hemos registrado tu abono de *L. ${payment.monto.toLocaleString('es-HN', { minimumFractionDigits: 2 })}* para tu préstamo *${payment.prestamoCodigo}* con fecha del ${dateFormatted} a las ${timeFormatted}. ¡Muchas gracias por tu puntualidad! *PrestaFlow*`;
    
    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  // Print Receipt
  protected printReceipt(): void {
    window.print();
  }

  // Toasts
  private triggerToast(type: 'success' | 'info' | 'warning', title: string, message: string): void {
    const id = ++this.toastIdCounter;
    const newToast: Toast = { id, type, title, message };
    this.toasts.update(current => [...current, newToast]);
    setTimeout(() => {
      this.toasts.update(current => current.filter(t => t.id !== id));
    }, 4000);
  }

  // Dropdown menus
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
