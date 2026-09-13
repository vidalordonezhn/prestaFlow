import { Component, OnInit, signal, computed, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { ApiAuthService } from '../services/api-auth.service';
import { SettingsService } from '../services/settings.service';
import { ApiClientsService, ClienteResponse } from '../services/api-clients.service';
import { ApiPrestamosService, PrestamoResponse } from '../services/api-prestamos.service';
import { ApiPagosService } from '../services/api-pagos.service';
import { ApiCajaService, CuentaResponse } from '../services/api-caja.service';
import { PermissionsService } from '../services/permissions.service';
import { exportToCsv } from '../core/utils/export.utils';

interface Loan {
  id: string;
  dbId: number;
  clientName: string;
  clientPhone: string;
  startDate: Date;
  capital: number;
  interesPorcentaje: number;
  plazoCuotas: number;
  cuotaMonto: number;
  cuotasPagadas: number;
  totalPagar: number;
  totalPagado: number;
  saldoRestante: number;
  status: 'Activo' | 'Pagado' | 'Mora';
  statusDetail: 'Al día' | 'Atrasado' | 'Completado';
  frecuencia: 'Diario' | 'Semanal' | 'Mensual';
  tipoPrestamo: string;
  metodoDesembolso: string;
  tipoInteres: 'Fijo' | 'Variable';
  tasaMoraPorcentaje: number;
  cuotasAtrasadasCount?: number;
  montoParaEstarAlDia?: number;
  cuotas: any[];
}

interface AmortizationItem {
  numeroCuota: number;
  fechaVencimiento: Date;
  monto: number;
  montoPrincipal: number;
  montoInteres: number;
  montoMoratorio: number;
  montoPagado: number;
  status: 'Pagada' | 'Pendiente' | 'Vencida';
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
  selector: 'app-loans',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loans.component.html',
  styleUrl: './loans.component.scss'
})
export class LoansComponent implements OnInit {
  protected readonly Math = Math;
  protected readonly auth = inject(ApiAuthService);
  protected readonly permissions = inject(PermissionsService);
  protected readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);
  private readonly apiClientsService = inject(ApiClientsService);
  private readonly apiPrestamosService = inject(ApiPrestamosService);
  private readonly apiPagosService = inject(ApiPagosService);
  private readonly apiCajaService = inject(ApiCajaService);

  // Current date
  protected readonly currentDate = signal(new Date());

  // Sidebar User Dropdown Menu
  protected readonly showUserDropdown = signal<boolean>(false);

  // Search and Filter Signals
  protected readonly searchQuery = signal('');
  protected readonly statusFilter = signal<'all' | 'activo' | 'mora' | 'pagado'>('all');
  protected readonly routeFilter = signal<'all' | 'Diario' | 'Semanal' | 'Mensual'>('all');

  // Toasts
  protected readonly toasts = signal<Toast[]>([]);
  private toastIdCounter = 0;

  // Modals visibility
  protected readonly showCreateModal = signal(false);
  protected readonly showDetailsModal = signal(false);
  
  // Selected Loan for Detail View
  protected readonly selectedLoan = signal<Loan | null>(null);

  // Quick Payment Modal Signals
  protected readonly showPaymentModal = signal(false);
  protected readonly paymentLoan = signal<Loan | null>(null);
  protected readonly pendingCuotas = signal<PendingCuotaOption[]>([]);
  protected readonly selectedCuotasCount = computed(() => this.pendingCuotas().filter(c => c.selected).length);
  protected readonly paymentAmount = signal<number>(0);
  protected readonly paymentMethod = signal<'Efectivo' | 'Transferencia'>('Efectivo');

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
  protected readonly newLoanType = signal<string>('Personal');
  protected readonly newDisbursementMethod = signal<string>('Efectivo');
  protected readonly newInterestType = signal<'Fijo' | 'Variable'>('Fijo');
  protected readonly newTasaMora = signal<number>(5);

  // List of Loans
  protected readonly loans = signal<Loan[]>([]);

  // Sidebar Menu Items
  protected readonly menuItems = [
    { name: 'Dashboard', icon: 'dashboard', active: false, route: '/' },
    { name: 'Cobros de Hoy', icon: 'route', active: false, route: '/cobros' },
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
      return acc + curr.saldoRestante;
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
        l.id.toLowerCase().includes(query) ||
        l.clientPhone.includes(query)
      );
    }

    // Filter by route / frequency
    const route = this.routeFilter();
    if (route !== 'all') {
      result = result.filter(l => l.frecuencia === route);
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

  // Open Payment Modal
  protected openRegisterPayment(loan: Loan): void {
    this.paymentLoan.set(loan);
    this.paymentMethod.set('Efectivo');

    const hoyDate = new Date();
    hoyDate.setHours(0, 0, 0, 0);

    let cuotasList: PendingCuotaOption[] = [];
    if (loan.cuotas && loan.cuotas.length > 0) {
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
      this.paymentAmount.set(loan.cuotaMonto);
    }

    this.showPaymentModal.set(true);
  }

  // Close Payment Modal
  protected closeRegisterPayment(): void {
    this.showPaymentModal.set(false);
    this.paymentLoan.set(null);
    this.pendingCuotas.set([]);
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

  // Set Preset Amount Pills
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
      const loan = this.paymentLoan();
      if (loan) {
        this.paymentAmount.set(Math.round(loan.cuotaMonto * count * 100) / 100);
      }
    }
  }

  // Set Full Balance Amount
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
      const loan = this.paymentLoan();
      if (loan && loan.montoParaEstarAlDia) {
        this.paymentAmount.set(loan.montoParaEstarAlDia);
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
      const loan = this.paymentLoan();
      if (loan && loan.saldoRestante) {
        this.paymentAmount.set(loan.saldoRestante);
      }
    }
  }

  // Submit Payment
  protected submitPayment(): void {
    const loan = this.paymentLoan();
    if (!loan) return;

    const monto = this.paymentAmount();
    if (monto <= 0) {
      this.triggerToast('warning', 'Monto Inválido', 'Ingrese un valor mayor a cero.');
      return;
    }

    const payload = {
      prestamoId: loan.dbId,
      monto,
      metodoPago: this.paymentMethod()
    };

    this.apiPagosService.createPago(payload).subscribe({
      next: () => {
        this.triggerToast('success', 'Pago Registrado', `Se procesó con éxito el abono de L. ${monto.toFixed(2)} al préstamo ${loan.id}.`);
        this.closeRegisterPayment();
        this.cargarPrestamos();
        
        // If details modal was open, refresh selectedLoan
        if (this.showDetailsModal() && this.selectedLoan()?.dbId === loan.dbId) {
          this.apiPrestamosService.getPrestamos().subscribe({
            next: (res) => {
              const updated = res.find(p => p.id === loan.dbId);
              if (updated) {
                this.selectedLoan.set(this.mapLoanResponse(updated));
              }
            }
          });
        }
      },
      error: (err) => {
        const msg = err.error?.mensaje || 'No se pudo registrar el pago en el servidor.';
        this.triggerToast('warning', 'Error de Pago', msg);
      }
    });
  }

  // WhatsApp Reminder
  protected sendReminderWhatsApp(loan: Loan): void {
    const cleanPhone = (loan.clientPhone || '').replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.startsWith('504') ? cleanPhone : `504${cleanPhone}`;
    const user = this.auth.currentUser();
    const cobradorName = user ? user.nombre : 'Tu Asesor';

    if (!confirm(`¿Deseas enviar el recordatorio de cobro por WhatsApp a ${loan.clientName} (+${formattedPhone})?`)) {
      return;
    }

    const message = `Hola *${loan.clientName}*, te saluda *${cobradorName}* de *PrestaFlow*. Te recordamos el estado de tu préstamo *${loan.id}* con cuota de *L. ${loan.cuotaMonto.toLocaleString('es-HN', { minimumFractionDigits: 2 })}* (Saldo restante: L. ${loan.saldoRestante.toLocaleString('es-HN', { minimumFractionDigits: 2 })}). ¡Quedamos atentos a tu atención!`;
    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  // Amortization Table mapped from physical db cuotas
  protected readonly amortizationTable = computed<any[]>(() => {
    const loan = this.selectedLoan();
    if (!loan || !loan.cuotas) return [];

    const isLoanFullyPaid = loan.status === 'Pagado' || loan.saldoRestante <= 0.05 || (loan.totalPagado >= (loan.totalPagar - 0.05));
    const sortedCuotas = [...loan.cuotas].sort((a: any, b: any) => a.numeroCuota - b.numeroCuota);
    let currentCapital = loan.capital;

    return sortedCuotas.map((c: any) => {
      const totalMonto = c.montoPrincipal + c.montoInteres + (c.montoMoratorio || 0);
      const totalPagadoCuota = (c.montoPagadoPrincipal || 0) + (c.montoPagadoInteres || 0) + (c.montoPagadoMora || 0);
      
      let status: 'Pagada' | 'Pendiente' | 'Vencida' | 'Parcial' = 'Pendiente';
      if (isLoanFullyPaid || c.estado === 'Pagado' || totalPagadoCuota >= totalMonto - 0.05) {
        status = 'Pagada';
      } else if (totalPagadoCuota > 0) {
        status = 'Parcial';
      } else if (c.estado === 'Vencido') {
        status = 'Vencida';
      }
      
      const saldoInicial = currentCapital;
      const saldoFinal = Math.max(0, currentCapital - (c.montoPagadoPrincipal > 0 ? c.montoPagadoPrincipal : (status === 'Pagada' ? c.montoPrincipal : 0)));
      
      currentCapital = Math.max(0, currentCapital - c.montoPrincipal);

      return {
        id: c.id,
        numeroCuota: c.numeroCuota,
        fechaVencimiento: new Date(c.fechaVencimiento),
        monto: totalMonto,
        montoPrincipal: c.montoPrincipal,
        montoInteres: c.montoInteres,
        montoMoratorio: c.montoMoratorio || 0,
        montoPagado: totalPagadoCuota,
        saldoInicial,
        saldoFinal,
        status
      };
    });
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

  protected capitalizarInteresCuota(cuotaId: number): void {
    const loan = this.selectedLoan();
    if (!loan) return;

    if (!confirm('¿Estás seguro de que deseas capitalizar el interés pendiente de esta cuota? Esto sumará el interés al capital principal del préstamo y recalculará las cuotas futuras.')) {
      return;
    }

    this.apiPrestamosService.capitalizarInteres(loan.dbId, cuotaId).subscribe({
      next: (res) => {
        this.triggerToast('success', 'Éxito', 'Interés capitalizado y cuotas recalculadas correctamente.');
        
        // Refrescar listado de préstamos y actualizar modal
        this.apiPrestamosService.getPrestamos().subscribe({
          next: (resPrestamos) => {
            const mapped = resPrestamos.map(p => this.mapLoanResponse(p));
            this.loans.set(mapped);
            
            const updatedLoan = mapped.find(p => p.dbId === loan.dbId);
            if (updatedLoan) {
              this.selectedLoan.set(updatedLoan);
            }
          }
        });
      },
      error: (err) => {
        const msg = err.error?.mensaje || 'No se pudo realizar la capitalización de intereses.';
        this.triggerToast('warning', 'Error de Capitalización', msg);
      }
    });
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

  private mapLoanResponse(p: PrestamoResponse): Loan {
    let totalPagar = 0;
    let totalPagado = 0;
    let cuotasPagadasCount = 0;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    let cuotasAtrasadasCount = 0;
    let montoParaEstarAlDia = 0;

    if (p.cuotas && p.cuotas.length > 0) {
      totalPagar = p.cuotas.reduce((sum: number, c: any) => sum + (c.montoPrincipal + c.montoInteres + (c.montoMoratorio || 0)), 0);
      totalPagado = p.cuotas.reduce((sum: number, c: any) => sum + ((c.montoPagadoPrincipal || 0) + (c.montoPagadoInteres || 0) + (c.montoPagadoMora || 0)), 0);
      cuotasPagadasCount = p.cuotas.filter((c: any) => c.estado === 'Pagado' || ((c.montoPagadoPrincipal || 0) + (c.montoPagadoInteres || 0) + (c.montoPagadoMora || 0)) >= (c.montoPrincipal + c.montoInteres + (c.montoMoratorio || 0))).length;
      
      const cuotasVencidas = p.cuotas.filter((c: any) => {
        const fechaVenc = new Date(c.fechaVencimiento);
        fechaVenc.setHours(0, 0, 0, 0);
        const totalCuota = c.montoPrincipal + c.montoInteres + (c.montoMoratorio || 0);
        const pagadoCuota = (c.montoPagadoPrincipal || 0) + (c.montoPagadoInteres || 0) + (c.montoPagadoMora || 0);
        const saldoCuota = totalCuota - pagadoCuota;
        return (c.estado === 'Vencido' || fechaVenc <= hoy) && c.estado !== 'Pagado' && saldoCuota > 0.05;
      });

      cuotasAtrasadasCount = cuotasVencidas.length;
      montoParaEstarAlDia = cuotasVencidas.reduce((sum: number, c: any) => {
        const totalCuota = c.montoPrincipal + c.montoInteres + (c.montoMoratorio || 0);
        const pagadoCuota = (c.montoPagadoPrincipal || 0) + (c.montoPagadoInteres || 0) + (c.montoPagadoMora || 0);
        return sum + Math.max(0, totalCuota - pagadoCuota);
      }, 0);
    } else {
      totalPagar = p.cuotaMonto * p.plazoCuotas;
      cuotasPagadasCount = p.cuotasPagadas || 0;
      totalPagado = p.cuotaMonto * cuotasPagadasCount;
    }

    const saldoRestante = Math.max(0, totalPagar - totalPagado);
    const estaTotalmentePagado = saldoRestante <= 0.05 || totalPagado >= (totalPagar - 0.05) || (p.cuotas && p.cuotas.length > 0 && cuotasPagadasCount === p.cuotas.length);

    let computedStatus: 'Activo' | 'Pagado' | 'Mora' = p.status || 'Activo';
    let statusDetail: 'Al día' | 'Completado' | 'Atrasado' = 'Al día';

    if (estaTotalmentePagado) {
      cuotasAtrasadasCount = 0;
      montoParaEstarAlDia = 0;
      computedStatus = 'Pagado';
      statusDetail = 'Completado';
    } else if (cuotasAtrasadasCount > 0 || p.status === 'Mora') {
      computedStatus = 'Mora';
      statusDetail = 'Atrasado';
    } else {
      computedStatus = 'Activo';
      statusDetail = 'Al día';
    }

    return {
      id: p.codigo,
      dbId: p.id,
      clientName: p.clienteNombre,
      clientPhone: p.clientePhone,
      startDate: new Date(p.fechaOtorgado),
      capital: p.capital,
      interesPorcentaje: p.interesPorcentaje,
      plazoCuotas: p.plazoCuotas,
      cuotaMonto: p.cuotaMonto,
      cuotasPagadas: cuotasPagadasCount,
      totalPagar,
      totalPagado,
      saldoRestante,
      status: computedStatus,
      statusDetail,
      frecuencia: p.frecuencia,
      tipoPrestamo: p.tipoPrestamo,
      metodoDesembolso: p.metodoDesembolso,
      tipoInteres: p.tipoInteres,
      tasaMoraPorcentaje: p.tasaMoraPorcentaje,
      cuotasAtrasadasCount,
      montoParaEstarAlDia,
      cuotas: p.cuotas
    };
  }

  protected cargarClientes(): void {
    this.apiClientsService.getClientes().subscribe({
      next: (res) => this.availableClients.set(res),
      error: () => this.triggerToast('warning', 'Error de Carga', 'No se pudieron obtener los clientes registrados.')
    });
  }

  protected cargarPrestamos(): void {
    this.apiPrestamosService.getPrestamos().subscribe({
      next: (res) => {
        const mapped = res.map(p => this.mapLoanResponse(p));
        this.loans.set(mapped);
      },
      error: () => this.triggerToast('warning', 'Error de Carga', 'No se pudieron obtener los préstamos de la base de datos.')
    });
  }

  protected cargarCuentas(): void {
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
      cuentaDesembolsoId: accountId,
      tipoPrestamo: this.newLoanType(),
      metodoDesembolso: this.newDisbursementMethod(),
      tipoInteres: this.newInterestType(),
      tasaMoraPorcentaje: this.newTasaMora()
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

  // Export Loans to CSV
  protected exportLoansCsv(): void {
    const list = this.filteredLoans();
    exportToCsv<Loan>('Cartera_Prestamos_PrestaFlow', list, [
      { header: 'Código', field: 'id' },
      { header: 'Cliente', field: 'clientName' },
      { header: 'Teléfono', field: 'clientPhone' },
      { header: 'Fecha Otorgado', format: l => new Date(l.startDate).toLocaleDateString('es-HN') },
      { header: 'Capital (L.)', field: 'capital' },
      { header: 'Tasa Interés (%)', field: 'interesPorcentaje' },
      { header: 'Frecuencia', field: 'frecuencia' },
      { header: 'Plazo Cuotas', field: 'plazoCuotas' },
      { header: 'Cuotas Pagadas', field: 'cuotasPagadas' },
      { header: 'Cuota Monto (L.)', field: 'cuotaMonto' },
      { header: 'Total a Pagar (L.)', field: 'totalPagar' },
      { header: 'Total Pagado (L.)', field: 'totalPagado' },
      { header: 'Saldo Restante (L.)', field: 'saldoRestante' },
      { header: 'Estado', field: 'status' }
    ]);
  }

  // Anular Pago de un Préstamo (Auditoría)
  protected anularPago(pagoId: number): void {
    if (!this.permissions.canManageUsers()) {
      this.triggerToast('warning', 'Acceso Restringido', 'Solo administradores pueden anular registros de pago.');
      return;
    }

    const motivo = prompt('Ingrese el motivo de la anulación del pago (mínimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) {
      if (motivo !== null) {
        this.triggerToast('warning', 'Motivo Requerido', 'Debe especificar un motivo válido de al menos 5 caracteres.');
      }
      return;
    }

    this.apiPagosService.anularPago(pagoId, { motivo: motivo.trim() }).subscribe({
      next: () => {
        this.triggerToast('success', 'Pago Anulado', `El pago #${pagoId} ha sido anulado y los saldos han sido revertidos.`);
        this.cargarPrestamos();
        if (this.selectedLoan()) {
          this.closeDetails();
        }
      },
      error: (err) => {
        const msg = err.error?.mensaje || 'No se pudo anular el pago en el sistema.';
        this.triggerToast('warning', 'Error al Anular', msg);
      }
    });
  }

  protected onLogout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
