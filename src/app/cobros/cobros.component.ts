import { Component, signal, computed, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { ApiAuthService } from '../services/api-auth.service';
import { ApiPrestamosService } from '../services/api-prestamos.service';
import { ApiPagosService } from '../services/api-pagos.service';
import { SettingsService } from '../services/settings.service';
import { exportToCsv } from '../core/utils/export.utils';

interface Client {
  id: string;
  loanId: number;
  name: string;
  phone: string;
  cuota: number;
  saldoTotal: number;
  frecuencia: 'Diario' | 'Semanal' | 'Mensual';
  pagado: boolean;
  totalAbonadoHoy?: number;
  mora: boolean;
  cuotasAtrasadasCount?: number;
  montoParaEstarAlDia?: number;
  address: string;
  zone: string;
}

interface PendingCuotaOption {
  id: number;
  numeroCuota: number;
  fechaVencimiento: Date;
  montoTotal: number;
  montoPagado: number;
  saldoRestante: number;
  estado: string;
  isVencida: boolean;
  selected: boolean;
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
  imports: [CommonModule],
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

  // Search and Filter Signals
  protected readonly searchQuery = signal('');
  protected readonly statusFilter = signal<'all' | 'pendientes' | 'cobrados' | 'mora'>('all');
  protected readonly routeFilter = signal<'all' | 'Diario' | 'Semanal' | 'Mensual'>('all');
  protected readonly viewMode = signal<'table' | 'cards'>('table');

  // Toast Stack Signal
  protected readonly toasts = signal<Toast[]>([]);
  private toastIdCounter = 0;

  // Modal Control Signals
  protected readonly showPaymentModal = signal(false);
  protected readonly selectedClient = signal<Client | null>(null);
  protected readonly pendingCuotas = signal<PendingCuotaOption[]>([]);
  protected readonly selectedCuotasCount = computed(() => this.pendingCuotas().filter(c => c.selected).length);
  
  // Payment Form Signals
  protected readonly paymentAmount = signal<number>(0);
  protected readonly paymentMethod = signal<'Efectivo' | 'Transferencia'>('Efectivo');

  // Receipt Modal Control Signals
  protected readonly showReceiptModal = signal(false);
  protected readonly selectedPayment = signal<any | null>(null);

  // WhatsApp Confirmation Modal Signals
  protected readonly showWhatsAppConfirmModal = signal(false);
  protected readonly waConfirmData = signal<{
    title: string;
    clientName: string;
    phone: string;
    message: string;
    url: string;
  } | null>(null);

  // Client Data Signal
  protected readonly clients = signal<Client[]>([]);

  // Raw list of payments today for receipt lookups
  protected readonly todayPayments = signal<any[]>([]);

  // List of active loans to retrieve schedules
  protected readonly activeLoansList = signal<any[]>([]);

  // KPIs del Día
  protected readonly kpiMetaDelDia = computed(() => {
    return this.clients().reduce((sum, c) => sum + c.cuota, 0);
  });

  protected readonly kpiTotalCobradoHoy = computed(() => {
    return this.clients().reduce((sum, c) => sum + (c.totalAbonadoHoy || 0), 0);
  });

  protected readonly kpiSaldoPendienteHoy = computed(() => {
    return Math.max(0, this.kpiMetaDelDia() - this.kpiTotalCobradoHoy());
  });

  protected readonly kpiCobradosCount = computed(() => {
    return this.clients().filter(c => c.pagado).length;
  });

  protected readonly kpiPendientesCount = computed(() => {
    return this.clients().filter(c => !c.pagado).length;
  });

  protected readonly kpiMoraCount = computed(() => {
    return this.clients().filter(c => c.mora).length;
  });

  protected readonly kpiAvancePorcentaje = computed(() => {
    const total = this.clients().length;
    return total > 0 ? Math.round((this.kpiCobradosCount() / total) * 100) : 0;
  });

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
    let list = this.clients();

    // 1. Filter by Status
    const status = this.statusFilter();
    if (status === 'pendientes') {
      list = list.filter(c => !c.pagado);
    } else if (status === 'cobrados') {
      list = list.filter(c => c.pagado);
    } else if (status === 'mora') {
      list = list.filter(c => c.mora);
    }

    // 2. Filter by Route / Frequency
    const route = this.routeFilter();
    if (route !== 'all') {
      list = list.filter(c => c.frecuencia === route);
    }

    // 3. Filter by Search Query
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      list = list.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.id.includes(query) || 
        c.phone.includes(query) ||
        c.zone.toLowerCase().includes(query)
      );
    }

    return list;
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
            this.todayPayments.set(resPagos);
            const hoyStr = new Date().toDateString();
            const hoyDate = new Date();
            hoyDate.setHours(0, 0, 0, 0);

            const prestamosActivos = resPrestamos.filter(p => p.status === 'Activo' || p.status === 'Mora');

            const routeClients = prestamosActivos.map(p => {
              const pagosHoy = resPagos.filter((pago: any) => 
                pago.prestamoId === p.id && 
                new Date(pago.fechaPago).toDateString() === hoyStr
              );
              const pagadoHoy = pagosHoy.length > 0;
              const totalAbonadoHoy = pagosHoy.reduce((sum: number, pago: any) => sum + pago.monto, 0);

              let totalPagar = 0;
              let totalPagado = 0;
              let cuotasAtrasadasCount = 0;
              let montoParaEstarAlDia = 0;

              if (p.cuotas && p.cuotas.length > 0) {
                totalPagar = p.cuotas.reduce((sum: number, c: any) => sum + (c.montoPrincipal + c.montoInteres + (c.montoMoratorio || 0)), 0);
                totalPagado = p.cuotas.reduce((sum: number, c: any) => sum + ((c.montoPagadoPrincipal || 0) + (c.montoPagadoInteres || 0) + (c.montoPagadoMora || 0)), 0);

                const cuotasVencidas = p.cuotas.filter((c: any) => {
                  const fechaVenc = new Date(c.fechaVencimiento);
                  fechaVenc.setHours(0, 0, 0, 0);
                  const totalCuota = c.montoPrincipal + c.montoInteres + (c.montoMoratorio || 0);
                  const pagadoCuota = (c.montoPagadoPrincipal || 0) + (c.montoPagadoInteres || 0) + (c.montoPagadoMora || 0);
                  const saldoCuota = totalCuota - pagadoCuota;
                  return (c.estado === 'Vencido' || fechaVenc <= hoyDate) && c.estado !== 'Pagado' && saldoCuota > 0.05;
                });

                cuotasAtrasadasCount = cuotasVencidas.length;
                montoParaEstarAlDia = cuotasVencidas.reduce((sum: number, c: any) => {
                  const totalCuota = c.montoPrincipal + c.montoInteres + (c.montoMoratorio || 0);
                  const pagadoCuota = (c.montoPagadoPrincipal || 0) + (c.montoPagadoInteres || 0) + (c.montoPagadoMora || 0);
                  return sum + Math.max(0, totalCuota - pagadoCuota);
                }, 0);
              } else {
                totalPagar = p.cuotaMonto * p.plazoCuotas;
                totalPagado = p.cuotaMonto * (p.cuotasPagadas || 0);
              }
              const saldoTotal = Math.max(0, totalPagar - totalPagado);
              const estaTotalmentePagado = saldoTotal <= 0.05 || totalPagado >= (totalPagar - 0.05);
              if (estaTotalmentePagado) {
                cuotasAtrasadasCount = 0;
                montoParaEstarAlDia = 0;
              }
              const estaEnMora = !estaTotalmentePagado && (cuotasAtrasadasCount > 0 || p.status === 'Mora');

              return {
                id: p.codigo,
                loanId: p.id,
                name: p.clienteNombre,
                phone: p.clientePhone,
                cuota: p.cuotaMonto,
                saldoTotal,
                frecuencia: p.frecuencia,
                pagado: pagadoHoy,
                totalAbonadoHoy: totalAbonadoHoy,
                mora: estaEnMora,
                cuotasAtrasadasCount,
                montoParaEstarAlDia,
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
    this.selectedClient.set(client);
    this.paymentMethod.set('Efectivo');

    const loan = this.activeLoansList().find(p => p.id === client.loanId);
    const hoyDate = new Date();
    hoyDate.setHours(0, 0, 0, 0);

    let cuotasList: PendingCuotaOption[] = [];
    if (loan && loan.cuotas && loan.cuotas.length > 0) {
      cuotasList = loan.cuotas
        .map((c: any) => {
          const total = c.montoPrincipal + c.montoInteres + (c.montoMoratorio || 0);
          const pagado = (c.montoPagadoPrincipal || 0) + (c.montoPagadoInteres || 0) + (c.montoPagadoMora || 0);
          const saldo = Math.max(0, Math.round((total - pagado) * 100) / 100);
          const fVenc = new Date(c.fechaVencimiento);
          fVenc.setHours(0, 0, 0, 0);
          const isVenc = (c.estado === 'Vencido' || fVenc <= hoyDate) && c.estado !== 'Pagado' && saldo > 0.05;

          return {
            id: c.id,
            numeroCuota: c.numeroCuota,
            fechaVencimiento: new Date(c.fechaVencimiento),
            montoTotal: total,
            montoPagado: pagado,
            saldoRestante: saldo,
            estado: c.estado || (isVenc ? 'Vencida' : 'Pendiente'),
            isVencida: isVenc,
            selected: false
          };
        })
        .filter((c: any) => c.saldoRestante > 0.05 && c.estado !== 'Pagado');
    }

    if (cuotasList.length > 0) {
      const overdueCuotas = cuotasList.filter(c => c.isVencida);
      if (overdueCuotas.length > 0) {
        cuotasList.forEach(c => c.selected = c.isVencida);
      } else {
        cuotasList[0].selected = true;
      }
      this.pendingCuotas.set(cuotasList);
      const sum = cuotasList.filter(c => c.selected).reduce((acc, c) => acc + c.saldoRestante, 0);
      this.paymentAmount.set(Math.round(sum * 100) / 100);
    } else {
      this.pendingCuotas.set([]);
      this.paymentAmount.set(client.cuota);
    }

    this.showPaymentModal.set(true);
  }

  protected selectCuotaUpTo(targetIndex: number): void {
    const list = this.pendingCuotas().map(c => ({ ...c }));
    if (!list[targetIndex]) return;

    const isCurrentlySelected = list[targetIndex].selected;
    const isLastSelected = targetIndex === list.length - 1 || (!list[targetIndex + 1]?.selected);

    if (isCurrentlySelected && isLastSelected) {
      list[targetIndex].selected = false;
    } else {
      list.forEach((c, idx) => {
        c.selected = idx <= targetIndex;
      });
    }

    this.pendingCuotas.set(list);
    const sum = list.filter(c => c.selected).reduce((acc, c) => acc + c.saldoRestante, 0);
    this.paymentAmount.set(Math.round(sum * 100) / 100);
  }

  protected setPresetAmount(count: number): void {
    const list = this.pendingCuotas().map(c => ({ ...c }));
    if (list.length > 0) {
      list.forEach((c, idx) => {
        c.selected = idx < count;
      });
      this.pendingCuotas.set(list);
      const sum = list.filter(c => c.selected).reduce((acc, c) => acc + c.saldoRestante, 0);
      this.paymentAmount.set(Math.round(sum * 100) / 100);
    } else {
      const client = this.selectedClient();
      if (client) {
        this.paymentAmount.set(Math.round(client.cuota * count * 100) / 100);
      }
    }
  }

  protected setPonerAlDiaAmount(): void {
    const list = this.pendingCuotas().map(c => ({ ...c }));
    if (list.length > 0) {
      list.forEach(c => {
        c.selected = c.isVencida;
      });
      this.pendingCuotas.set(list);
      const sum = list.filter(c => c.selected).reduce((acc, c) => acc + c.saldoRestante, 0);
      this.paymentAmount.set(Math.round(sum * 100) / 100);
    } else {
      const client = this.selectedClient();
      if (client && client.montoParaEstarAlDia) {
        this.paymentAmount.set(client.montoParaEstarAlDia);
      }
    }
  }

  protected setFullBalanceAmount(): void {
    const list = this.pendingCuotas().map(c => ({ ...c }));
    if (list.length > 0) {
      list.forEach(c => {
        c.selected = true;
      });
      this.pendingCuotas.set(list);
      const sum = list.reduce((acc, c) => acc + c.saldoRestante, 0);
      this.paymentAmount.set(Math.round(sum * 100) / 100);
    } else {
      const client = this.selectedClient();
      if (client && client.saldoTotal) {
        this.paymentAmount.set(client.saldoTotal);
      }
    }
  }

  protected sendReminderWhatsApp(client: Client): void {
    const cleanPhone = (client.phone || '').replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.startsWith('504') ? cleanPhone : `504${cleanPhone}`;
    const user = this.auth.currentUser();
    const cobradorName = user ? user.nombre : 'Tu Asesor';

    const message = `Hola *${client.name}*, te saluda *${cobradorName}* de *PrestaFlow*. Te recordamos que hoy está programada la visita para la cuota de tu préstamo *${client.id}* por un valor de *L. ${client.cuota.toLocaleString('es-HN', { minimumFractionDigits: 2 })}*. ¡Quedamos atentos a tu atención!`;
    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;

    this.waConfirmData.set({
      title: 'Recordatorio de Cobro por WhatsApp',
      clientName: client.name,
      phone: formattedPhone,
      message: message,
      url: url
    });
    this.showWhatsAppConfirmModal.set(true);
  }

  protected verReciboHoy(client: Client): void {
    const hoy = new Date().toDateString();
    const pago = this.todayPayments().find(p => p.prestamoId === client.loanId && new Date(p.fechaPago).toDateString() === hoy);
    if (pago) {
      this.selectedPayment.set(pago);
      this.showReceiptModal.set(true);
    } else {
      this.openRegisterPayment(client);
    }
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

    const esAbonoExtra = amountPaid > client.cuota;

    this.apiPagosService.createPago({
      prestamoId: client.loanId,
      monto: amountPaid,
      metodoPago: methodPaid,
      esAbonoCapital: esAbonoExtra
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
    const cleanPhone = (payment.clientePhone || '').replace(/[^0-9]/g, '');
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

    const principal = Number(payment.montoPrincipal || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 });
    const interes = Number(payment.montoInteres || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 });
    const mora = Number(payment.montoMora || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 });
    const total = Number(payment.monto || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 });

    const message = `🧾 *COMPROBANTE DE PAGO - PRESTAFLOW*\n` +
      `------------------------------------------\n` +
      `👤 *Cliente:* ${payment.clienteNombre}\n` +
      `🔢 *Préstamo:* ${payment.prestamoCodigo}\n` +
      `📅 *Fecha:* ${dateFormatted} ${timeFormatted}\n` +
      `💳 *Método:* ${payment.metodoPago}\n` +
      `------------------------------------------\n` +
      `💰 *TOTAL RECIBIDO:* L. ${total}\n` +
      ` • *Abono a Capital:* L. ${principal}\n` +
      ` • *Pago de Interés:* L. ${interes}\n` +
      ` • *Mora Recaudada:* L. ${mora}\n` +
      `------------------------------------------\n` +
      `¡Muchas gracias por su pago puntual! ✨\n` +
      `_PrestaFlow - Sistema de Gestión Financiera_`;
    
    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;

    this.waConfirmData.set({
      title: 'Enviar Comprobante por WhatsApp',
      clientName: payment.clienteNombre,
      phone: formattedPhone,
      message: message,
      url: url
    });
    this.showWhatsAppConfirmModal.set(true);
  }

  // Confirm and Open WhatsApp
  protected confirmAndOpenWhatsApp(url: string): void {
    window.open(url, '_blank');
    this.showWhatsAppConfirmModal.set(false);
  }

  // Print Receipt (Thermal POS & Standard)
  protected printReceipt(): void {
    window.print();
  }

  // Export Today Route to CSV
  protected exportCobrosCsv(): void {
    const list = this.filteredClients();
    exportToCsv<Client>('Ruta_Cobros_PrestaFlow', list, [
      { header: 'Código Préstamo', field: 'id' },
      { header: 'Cliente', field: 'name' },
      { header: 'Teléfono', field: 'phone' },
      { header: 'Zona / Dirección', format: c => `${c.zone} - ${c.address}` },
      { header: 'Frecuencia', field: 'frecuencia' },
      { header: 'Cuota del Día (L.)', field: 'cuota' },
      { header: 'Saldo Total (L.)', field: 'saldoTotal' },
      { header: 'Estado', format: c => c.pagado ? 'Cobrado' : (c.mora ? 'En Mora' : 'Pendiente') },
      { header: 'Abonado Hoy (L.)', format: c => c.totalAbonadoHoy || 0 }
    ]);
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
