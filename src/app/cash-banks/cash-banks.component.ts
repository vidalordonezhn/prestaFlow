import { Component, OnInit, signal, computed, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { ApiCajaService, CuentaResponse, TransaccionResponse } from '../services/api-caja.service';
import { ApiAuthService } from '../services/api-auth.service';

interface Toast {
  id: number;
  type: 'success' | 'info' | 'warning';
  title: string;
  message: string;
}

@Component({
  selector: 'app-cash-banks',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './cash-banks.component.html',
  styleUrl: './cash-banks.component.scss'
})
export class CashBanksComponent implements OnInit {
  private readonly apiCajaService = inject(ApiCajaService);
  protected readonly auth = inject(ApiAuthService);
  private readonly router = inject(Router);

  // Current Date
  protected readonly currentDate = signal(new Date());

  // Sidebar User Dropdown Menu
  protected readonly showUserDropdown = signal<boolean>(false);

  // Search and Filter Signals
  protected readonly searchQuery = signal('');
  protected readonly typeFilter = signal<'all' | 'Ingreso' | 'Egreso' | 'Transferencia'>('all');

  // Core Data Signals
  protected readonly cuentas = signal<CuentaResponse[]>([]);
  protected readonly transacciones = signal<TransaccionResponse[]>([]);

  // Toasts State
  protected readonly toasts = signal<Toast[]>([]);
  private toastIdCounter = 0;

  // Modals Visibility
  protected readonly showMovementModal = signal(false);
  protected readonly showTransferModal = signal(false);

  // Form Fields: Registrar Movimiento
  protected readonly selectedAccountId = signal<number>(0);
  protected readonly movementType = signal<'Ingreso' | 'Egreso'>('Ingreso');
  protected readonly movementAmount = signal<string>('');
  protected readonly movementConcept = signal('');

  // Form Fields: Transferencia
  protected readonly sourceAccountId = signal<number>(0);
  protected readonly destAccountId = signal<number>(0);
  protected readonly transferAmount = signal<string>('');
  protected readonly transferConcept = signal('');

  // Sidebar Menu Items
  protected readonly menuItems = [
    { name: 'Dashboard', icon: 'dashboard', active: false, route: '/' },
    { name: 'Cobros de Hoy', icon: 'route', active: false, route: '/cobros' },
    { name: 'Préstamos', icon: 'currency_exchange', active: false, route: '/prestamos' },
    { name: 'Clientes', icon: 'people', active: false, route: '/clientes' },
    { name: 'Historial de Pagos', icon: 'receipt_long', active: false, route: '/pagos' },
    { name: 'Caja y Bancos', icon: 'account_balance', active: true, route: '/caja-bancos' },
    { name: 'Reportes', icon: 'analytics', active: false, route: '/reportes' },
    { name: 'Configuración', icon: 'settings', active: false, route: '/configuracion' }
  ];

  ngOnInit(): void {
    this.cargarDatos();
  }

  /**
   * Obtiene las cuentas y movimientos financieros de la API.
   */
  private cargarDatos(): void {
    this.apiCajaService.getCuentas().subscribe({
      next: (res) => this.cuentas.set(res),
      error: () => this.triggerToast('warning', 'Error de Carga', 'No se pudieron obtener las cuentas financieras.')
    });

    this.apiCajaService.getTransacciones().subscribe({
      next: (res) => this.transacciones.set(res),
      error: () => this.triggerToast('warning', 'Error de Carga', 'No se pudo obtener el historial de transacciones.')
    });
  }

  // Computed KPIs
  protected readonly saldoTotal = computed(() => {
    return this.cuentas().reduce((acc, curr) => acc + curr.saldo, 0);
  });

  protected readonly saldoCaja = computed(() => {
    return this.cuentas()
      .filter(c => c.tipo === 'Caja')
      .reduce((acc, curr) => acc + curr.saldo, 0);
  });

  protected readonly saldoBancos = computed(() => {
    return this.cuentas()
      .filter(c => c.tipo === 'Banco')
      .reduce((acc, curr) => acc + curr.saldo, 0);
  });

  protected readonly ingresosHoy = computed(() => {
    const hoy = new Date().toDateString();
    return this.transacciones()
      .filter(t => t.tipo === 'Ingreso' && new Date(t.fecha).toDateString() === hoy)
      .reduce((acc, curr) => acc + curr.monto, 0);
  });

  protected readonly egresosHoy = computed(() => {
    const hoy = new Date().toDateString();
    return this.transacciones()
      .filter(t => t.tipo === 'Egreso' && new Date(t.fecha).toDateString() === hoy)
      .reduce((acc, curr) => acc + curr.monto, 0);
  });

  // Filtered Ledger List
  protected readonly filteredTransacciones = computed(() => {
    let result = this.transacciones();

    // Text search
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      result = result.filter(t => 
        t.concepto.toLowerCase().includes(query) || 
        t.cuentaNombre.toLowerCase().includes(query) || 
        t.creadoPor.toLowerCase().includes(query)
      );
    }

    // Type filter
    const filter = this.typeFilter();
    if (filter !== 'all') {
      result = result.filter(t => t.tipo === filter);
    }

    return result;
  });

  // Handlers
  protected onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  protected openMovement(account?: CuentaResponse): void {
    this.selectedAccountId.set(account?.id || (this.cuentas()[0]?.id || 0));
    this.movementType.set('Ingreso');
    this.movementAmount.set('');
    this.movementConcept.set('');
    this.showMovementModal.set(true);
  }

  protected submitMovement(): void {
    const accountId = this.selectedAccountId();
    const type = this.movementType();
    const amountVal = parseFloat(this.movementAmount());
    const concept = this.movementConcept().trim();

    if (!accountId || isNaN(amountVal) || amountVal <= 0 || !concept) {
      this.triggerToast('warning', 'Campos Incompletos', 'Por favor, llena todos los campos correctamente.');
      return;
    }

    this.apiCajaService.crearTransaccion({
      cuentaId: accountId,
      tipo: type,
      monto: amountVal,
      concepto: concept
    }).subscribe({
      next: (res) => {
        this.triggerToast(
          'success',
          'Movimiento Registrado',
          `Se ha registrado el ${type.toLowerCase()} de L. ${amountVal.toLocaleString('es-HN')} con éxito.`
        );
        this.cargarDatos(); // Recargar datos
        this.showMovementModal.set(false);
      },
      error: (err) => {
        const msg = err.error?.mensaje || 'No se pudo registrar el movimiento.';
        this.triggerToast('warning', 'Error de Operación', msg);
      }
    });
  }

  protected openTransfer(sourceAccount?: CuentaResponse): void {
    this.sourceAccountId.set(sourceAccount?.id || (this.cuentas()[0]?.id || 0));
    const dest = this.cuentas().find(c => c.id !== this.sourceAccountId());
    this.destAccountId.set(dest?.id || 0);
    this.transferAmount.set('');
    this.transferConcept.set('');
    this.showTransferModal.set(true);
  }

  protected onSelectedAccountChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.selectedAccountId.set(Number(val));
  }

  protected onSourceAccountChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    const accountId = Number(val);
    this.sourceAccountId.set(accountId);
    // Cambiar automáticamente destino si colisionan
    if (this.destAccountId() === accountId) {
      const other = this.cuentas().find(c => c.id !== accountId);
      this.destAccountId.set(other?.id || 0);
    }
  }

  protected onDestAccountChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.destAccountId.set(Number(val));
  }

  protected submitTransfer(): void {
    const srcId = this.sourceAccountId();
    const destId = this.destAccountId();
    const amountVal = parseFloat(this.transferAmount());
    const concept = this.transferConcept().trim();

    if (!srcId || !destId || isNaN(amountVal) || amountVal <= 0 || !concept) {
      this.triggerToast('warning', 'Campos Incompletos', 'Por favor, llena todos los campos correctamente.');
      return;
    }

    if (srcId === destId) {
      this.triggerToast('warning', 'Cuentas Iguales', 'La cuenta origen y destino deben ser distintas.');
      return;
    }

    this.apiCajaService.crearTransferencia({
      cuentaOrigenId: srcId,
      cuentaDestinoId: destId,
      monto: amountVal,
      concepto: concept
    }).subscribe({
      next: (res) => {
        this.triggerToast(
          'success',
          'Transferencia Realizada',
          `Se trasladaron L. ${amountVal.toLocaleString('es-HN')} exitosamente.`
        );
        this.cargarDatos();
        this.showTransferModal.set(false);
      },
      error: (err) => {
        const msg = err.error?.mensaje || 'No se pudo realizar la transferencia.';
        this.triggerToast('warning', 'Error de Operación', msg);
      }
    });
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

  // Toasts Helper
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
