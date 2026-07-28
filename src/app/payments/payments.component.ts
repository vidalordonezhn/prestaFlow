import { Component, OnInit, signal, computed, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { ApiAuthService } from '../services/api-auth.service';
import { ApiPagosService, PagoResponse } from '../services/api-pagos.service';

@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './payments.component.html',
  styleUrl: './payments.component.scss'
})
export class PaymentsComponent implements OnInit {
  protected readonly auth = inject(ApiAuthService);
  private readonly router = inject(Router);
  private readonly apiPagosService = inject(ApiPagosService);

  // Payments State
  protected readonly payments = signal<PagoResponse[]>([]);
  protected readonly searchQuery = signal('');
  protected readonly methodFilter = signal<'all' | 'Efectivo' | 'Transferencia'>('all');

  // Sidebar User Dropdown Menu
  protected readonly showUserDropdown = signal<boolean>(false);

  // Receipt Modal State
  protected readonly showReceiptModal = signal(false);
  protected readonly selectedPayment = signal<PagoResponse | null>(null);

  // Sidebar Menu Items
  protected readonly menuItems = [
    { name: 'Dashboard', icon: 'dashboard', active: false, route: '/' },
    { name: 'Cobros de Hoy', icon: 'route', active: false, route: '/cobros' },
    { name: 'Préstamos', icon: 'currency_exchange', active: false, route: '/prestamos' },
    { name: 'Clientes', icon: 'people', active: false, route: '/clientes' },
    { name: 'Historial de Pagos', icon: 'receipt_long', active: true, route: '/pagos' },
    { name: 'Caja y Bancos', icon: 'account_balance', active: false, route: '/caja-bancos' },
    { name: 'Reportes', icon: 'analytics', active: false, route: '/reportes' },
    { name: 'Configuración', icon: 'settings', active: false, route: '/configuracion' }
  ];

  ngOnInit(): void {
    this.cargarPagos();
  }

  private cargarPagos(): void {
    this.apiPagosService.getPagos().subscribe({
      next: (res) => {
        this.payments.set(res);
      },
      error: (err) => {
        console.error('Error al cargar historial de pagos:', err);
      }
    });
  }

  // Filtered Payments computation
  protected readonly filteredPayments = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.methodFilter();

    return this.payments().filter(p => {
      // 1. Filter by Method
      if (filter !== 'all' && p.metodoPago !== filter) {
        return false;
      }

      // 2. Filter by Search Query
      if (!query) return true;
      return (
        p.clienteNombre.toLowerCase().includes(query) ||
        p.clienteIdentidad.includes(query) ||
        p.prestamoCodigo.toLowerCase().includes(query) ||
        `TX-${p.id}`.toLowerCase().includes(query)
      );
    });
  });

  // KPI Computations
  protected readonly totalAbonado = computed(() => {
    return this.filteredPayments().reduce((sum, curr) => sum + curr.monto, 0);
  });

  protected readonly countAbonos = computed(() => {
    return this.filteredPayments().length;
  });

  // Handle Search Input
  protected onSearchInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.searchQuery.set(inputElement.value);
  }

  // Open Receipt Details Modal
  protected openReceipt(payment: PagoResponse): void {
    this.selectedPayment.set(payment);
    this.showReceiptModal.set(true);
  }

  // Close Receipt Modal
  protected closeReceipt(): void {
    this.showReceiptModal.set(false);
    this.selectedPayment.set(null);
  }

  // Share Receipt on WhatsApp
  protected shareOnWhatsApp(payment: PagoResponse): void {
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

  // Print Receipt slip
  protected printReceipt(): void {
    window.print();
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
