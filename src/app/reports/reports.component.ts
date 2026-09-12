import { Component, inject, signal, computed, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiAuthService } from '../services/api-auth.service';
import { ApiReportesService, ResumenCartera, IngresosReporte, MoraDeudor } from '../services/api-reportes.service';
import { ApiCajaService, CuentaResponse, TransaccionResponse } from '../services/api-caja.service';
import { ApiPagosService, PagoResponse } from '../services/api-pagos.service';
import { ApiPrestamosService, PrestamoResponse } from '../services/api-prestamos.service';
import { TabsService } from '../services/tabs.service';

export type KpiReportType = 'colocado' | 'interes' | 'cartera' | 'mora' | 'historico' | 'vivo';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss'
})
export class ReportsComponent implements OnInit {
  protected readonly auth = inject(ApiAuthService);
  protected readonly tabsService = inject(TabsService);
  private readonly router = inject(Router);
  private readonly apiReportesService = inject(ApiReportesService);
  private readonly apiCajaService = inject(ApiCajaService);
  private readonly apiPagosService = inject(ApiPagosService);
  private readonly apiPrestamosService = inject(ApiPrestamosService);

  // Sidebar User Dropdown Menu
  protected readonly showUserDropdown = signal<boolean>(false);

  // Estado de Carga
  protected readonly isLoading = signal<boolean>(true);

  // Active KPI Report Section
  protected readonly selectedKpiTab = signal<KpiReportType>('colocado');
  protected readonly kpiTableSearch = signal<string>('');

  // Ordenamiento Dinámico
  protected readonly sortColumn = signal<string>('fechaOtorgado');
  protected readonly sortDirection = signal<'asc' | 'desc'>('desc');

  // Paginación Inteligente
  protected readonly currentPage = signal<number>(1);
  protected readonly pageSize = signal<number>(10);

  // Rango de fechas y filtro seleccionado (iniciar en 'todos' para ver toda la data)
  protected readonly selectedFilter = signal<'hoy' | 'semana' | 'mes' | 'año' | 'todos'>('todos');
  protected readonly startDate = signal<string>('');
  protected readonly endDate = signal<string>('');

  // Estados reactivos cargados desde la API
  protected readonly kpiCartera = signal<ResumenCartera>({
    capitalColocado: 0,
    interesPendiente: 0,
    totalProyectado: 0,
    clientesMoraActiva: 0,
    capitalHistoricoPrestado: 0,
    capitalActual: 0
  });

  protected readonly rawIngresos = signal<IngresosReporte>({
    total: 0,
    capital: 0,
    interes: 0,
    mora: 0
  });

  protected readonly deudoresMora = signal<MoraDeudor[]>([]);
  protected readonly cuentasFinancieras = signal<any[]>([]);
  protected readonly movimientosContables = signal<TransaccionResponse[]>([]);
  protected readonly pagos = signal<PagoResponse[]>([]);
  protected readonly prestamos = signal<PrestamoResponse[]>([]);

  // Computado de cartera filtrada por período seleccionado
  protected readonly kpiCarteraFiltrada = computed(() => {
    const raw = this.kpiCartera();
    const filter = this.selectedFilter();
    const start = this.startDate();
    const end = this.endDate();
    const loans = this.prestamos();

    if (filter === 'todos' || !start || !end || loans.length === 0) {
      return raw;
    }

    const filteredLoans = loans.filter(l => {
      if (!l.fechaOtorgado) return true;
      const d = l.fechaOtorgado.split('T')[0];
      return d >= start && d <= end;
    });

    if (filteredLoans.length === 0) {
      return raw;
    }

    const capitalColocado = filteredLoans.reduce((sum, l) => sum + (l.capital || 0), 0);
    const interesPendiente = filteredLoans.reduce((sum, l) => sum + (l.capital * ((l.interesPorcentaje || 0) / 100)), 0);
    const totalProyectado = capitalColocado + interesPendiente;
    const clientesMora = filteredLoans.filter(l => l.status === 'Mora').length;

    return {
      ...raw,
      capitalColocado: capitalColocado > 0 ? capitalColocado : raw.capitalColocado,
      interesPendiente: interesPendiente > 0 ? interesPendiente : raw.interesPendiente,
      totalProyectado: totalProyectado > 0 ? totalProyectado : raw.totalProyectado,
      clientesMoraActiva: clientesMora > 0 ? clientesMora : raw.clientesMoraActiva
    };
  });

  // Computado de ingresos basados en los datos de la API
  protected readonly ingresosFiltrados = computed(() => {
    const data = this.rawIngresos();
    const capitalPct = data.total > 0 ? (data.capital / data.total) * 100 : 0;
    const interesPct = data.total > 0 ? (data.interes / data.total) * 100 : 0;
    const moraPct = data.total > 0 ? (data.mora / data.total) * 100 : 0;

    return {
      ...data,
      capitalPercent: capitalPct,
      interesPercent: interesPct,
      moraPercent: moraPct
    };
  });

  // Balance Total calculado dinámicamente
  protected readonly balanceTotal = computed(() => {
    return this.cuentasFinancieras().reduce((sum, c) => sum + c.saldo, 0);
  });

  // Estadísticas del Reporte Trimestral de Saldos Rezagados
  protected readonly saldosRezagadosTrimestre = computed(() => {
    const deudores = this.deudoresMora();
    const totalAtrasado = deudores.reduce((sum, d) => sum + d.montoAtrasado, 0);
    const carteraVencida = deudores.filter(d => d.diasRetraso > 30).length;
    const riesgoPerdida = deudores.filter(d => d.diasRetraso > 90).length;

    return {
      totalAtrasado,
      carteraVencida,
      riesgoPerdida
    };
  });

  // =========================================================================
  // 6 REPORTES DETALLADOS COMPUTADOS CON BÚSQUEDA Y ORDENAMIENTO
  // =========================================================================

  private sortArray<T>(arr: T[], col: string, dir: 'asc' | 'desc'): T[] {
    return [...arr].sort((a: any, b: any) => {
      let valA = a[col];
      let valB = b[col];

      if (valA == null) valA = '';
      if (valB == null) valB = '';

      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB.toString());
        return dir === 'asc' ? cmp : -cmp;
      } else {
        const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
        return dir === 'asc' ? cmp : -cmp;
      }
    });
  }

  // 1. Capital Colocado en el Período
  protected readonly listCapitalColocado = computed(() => {
    const filter = this.selectedFilter();
    const start = this.startDate();
    const end = this.endDate();
    const q = this.kpiTableSearch().toLowerCase().trim();
    let loans = this.prestamos();

    if (filter !== 'todos' && start && end) {
      loans = loans.filter(l => {
        if (!l.fechaOtorgado) return true;
        const d = l.fechaOtorgado.split('T')[0];
        return d >= start && d <= end;
      });
    }

    if (q) {
      loans = loans.filter(l => 
        (l.clienteNombre || '').toLowerCase().includes(q) ||
        (l.codigo || '').toLowerCase().includes(q) ||
        (l.tipoPrestamo || '').toLowerCase().includes(q)
      );
    }

    return this.sortArray(loans, this.sortColumn(), this.sortDirection());
  });

  // 2. Interés Proyectado
  protected readonly listInteresProyectado = computed(() => {
    const filter = this.selectedFilter();
    const start = this.startDate();
    const end = this.endDate();
    const q = this.kpiTableSearch().toLowerCase().trim();
    let loans = this.prestamos();

    if (filter !== 'todos' && start && end) {
      loans = loans.filter(l => {
        if (!l.fechaOtorgado) return true;
        const d = l.fechaOtorgado.split('T')[0];
        return d >= start && d <= end;
      });
    }

    let mapped = loans.map(l => {
      const interesTotal = (l.capital || 0) * ((l.interesPorcentaje || 0) / 100);
      const cuotasTotal = l.plazoCuotas || 1;
      const cuotasPag = l.cuotasPagadas || 0;
      const interesCobrado = (interesTotal / cuotasTotal) * cuotasPag;
      const interesPendiente = Math.max(0, interesTotal - interesCobrado);

      return {
        ...l,
        interesTotal,
        interesCobrado,
        interesPendiente
      };
    });

    if (q) {
      mapped = mapped.filter(l => 
        (l.clienteNombre || '').toLowerCase().includes(q) ||
        (l.codigo || '').toLowerCase().includes(q)
      );
    }

    return this.sortArray(mapped, this.sortColumn(), this.sortDirection());
  });

  // 3. Cartera Total (Retorno Esperado)
  protected readonly listCarteraTotal = computed(() => {
    const filter = this.selectedFilter();
    const start = this.startDate();
    const end = this.endDate();
    const q = this.kpiTableSearch().toLowerCase().trim();
    let loans = this.prestamos();

    if (filter !== 'todos' && start && end) {
      loans = loans.filter(l => {
        if (!l.fechaOtorgado) return true;
        const d = l.fechaOtorgado.split('T')[0];
        return d >= start && d <= end;
      });
    }

    let mapped = loans.map(l => {
      const interesTotal = (l.capital || 0) * ((l.interesPorcentaje || 0) / 100);
      const totalACobrar = (l.cuotaMonto && l.plazoCuotas) ? (l.cuotaMonto * l.plazoCuotas) : (l.capital + interesTotal);
      const totalAbonado = (l.cuotaMonto || 0) * (l.cuotasPagadas || 0);
      const saldoRestante = Math.max(0, totalACobrar - totalAbonado);
      const porcentajeAvance = l.plazoCuotas ? (l.cuotasPagadas / l.plazoCuotas) * 100 : 0;

      return {
        ...l,
        interesTotal,
        totalACobrar,
        totalAbonado,
        saldoRestante,
        porcentajeAvance
      };
    });

    if (q) {
      mapped = mapped.filter(l => 
        (l.clienteNombre || '').toLowerCase().includes(q) ||
        (l.codigo || '').toLowerCase().includes(q)
      );
    }

    return this.sortArray(mapped, this.sortColumn(), this.sortDirection());
  });

  // 4. Clientes en Mora
  protected readonly listClientesMora = computed(() => {
    const q = this.kpiTableSearch().toLowerCase().trim();
    let deudores = this.deudoresMora();

    if (q) {
      deudores = deudores.filter(d => 
        (d.clienteNombre || '').toLowerCase().includes(q) ||
        (d.clienteIdentidad || '').toLowerCase().includes(q) ||
        (d.prestamoCodigo || '').toLowerCase().includes(q)
      );
    }

    const col = this.sortColumn() === 'fechaOtorgado' ? 'montoAtrasado' : this.sortColumn();
    return this.sortArray(deudores, col, this.sortDirection());
  });

  // 5. Capital Histórico Prestado
  protected readonly listCapitalHistorico = computed(() => {
    const q = this.kpiTableSearch().toLowerCase().trim();
    let loans = this.prestamos();

    if (q) {
      loans = loans.filter(l => 
        (l.clienteNombre || '').toLowerCase().includes(q) ||
        (l.codigo || '').toLowerCase().includes(q) ||
        (l.tipoPrestamo || '').toLowerCase().includes(q)
      );
    }

    return this.sortArray(loans, this.sortColumn(), this.sortDirection());
  });

  // 6. Capital Vivo Actual
  protected readonly listCapitalVivo = computed(() => {
    const q = this.kpiTableSearch().toLowerCase().trim();
    let loans = this.prestamos().filter(l => l.status !== 'Pagado');

    let mapped = loans.map(l => {
      const capitalOriginal = l.capital || 0;
      const cuotasTotal = l.plazoCuotas || 1;
      const cuotasPag = l.cuotasPagadas || 0;
      const capitalRecuperado = (capitalOriginal / cuotasTotal) * cuotasPag;
      const capitalVivoPendiente = Math.max(0, capitalOriginal - capitalRecuperado);
      const cuotasRestantes = Math.max(0, cuotasTotal - cuotasPag);

      return {
        ...l,
        capitalOriginal,
        capitalRecuperado,
        capitalVivoPendiente,
        cuotasRestantes
      };
    });

    if (q) {
      mapped = mapped.filter(l => 
        (l.clienteNombre || '').toLowerCase().includes(q) ||
        (l.codigo || '').toLowerCase().includes(q)
      );
    }

    return this.sortArray(mapped, this.sortColumn(), this.sortDirection());
  });

  // =========================================================================
  // SUMATORIAS / TOTALES EN TIEMPO REAL POR REPORTE
  // =========================================================================
  protected readonly totalsColocado = computed(() => {
    const list = this.listCapitalColocado();
    return {
      count: list.length,
      capital: list.reduce((sum, l) => sum + (l.capital || 0), 0),
      cuota: list.reduce((sum, l) => sum + (l.cuotaMonto || 0), 0)
    };
  });

  protected readonly totalsInteres = computed(() => {
    const list = this.listInteresProyectado();
    return {
      count: list.length,
      capitalBase: list.reduce((sum, l) => sum + (l.capital || 0), 0),
      interesTotal: list.reduce((sum, l) => sum + (l.interesTotal || 0), 0),
      interesCobrado: list.reduce((sum, l) => sum + (l.interesCobrado || 0), 0),
      interesPendiente: list.reduce((sum, l) => sum + (l.interesPendiente || 0), 0)
    };
  });

  protected readonly totalsCartera = computed(() => {
    const list = this.listCarteraTotal();
    return {
      count: list.length,
      capitalInicial: list.reduce((sum, l) => sum + (l.capital || 0), 0),
      totalACobrar: list.reduce((sum, l) => sum + (l.totalACobrar || 0), 0),
      totalAbonado: list.reduce((sum, l) => sum + (l.totalAbonado || 0), 0),
      saldoRestante: list.reduce((sum, l) => sum + (l.saldoRestante || 0), 0)
    };
  });

  protected readonly totalsMora = computed(() => {
    const list = this.listClientesMora();
    return {
      count: list.length,
      cuotasVencidas: list.reduce((sum, d) => sum + (d.cuotasVencidas || 0), 0),
      montoAtrasado: list.reduce((sum, d) => sum + (d.montoAtrasado || 0), 0)
    };
  });

  protected readonly totalsHistorico = computed(() => {
    const list = this.listCapitalHistorico();
    return {
      count: list.length,
      capital: list.reduce((sum, l) => sum + (l.capital || 0), 0)
    };
  });

  protected readonly totalsVivo = computed(() => {
    const list = this.listCapitalVivo();
    return {
      count: list.length,
      capitalOriginal: list.reduce((sum, l) => sum + (l.capitalOriginal || 0), 0),
      capitalRecuperado: list.reduce((sum, l) => sum + (l.capitalRecuperado || 0), 0),
      capitalVivoPendiente: list.reduce((sum, l) => sum + (l.capitalVivoPendiente || 0), 0)
    };
  });

  // =========================================================================
  // PAGINACIÓN REACTIVA
  // =========================================================================
  protected readonly activeListTotalLength = computed(() => {
    switch (this.selectedKpiTab()) {
      case 'colocado': return this.listCapitalColocado().length;
      case 'interes': return this.listInteresProyectado().length;
      case 'cartera': return this.listCarteraTotal().length;
      case 'mora': return this.listClientesMora().length;
      case 'historico': return this.listCapitalHistorico().length;
      case 'vivo': return this.listCapitalVivo().length;
      default: return 0;
    }
  });

  protected readonly totalPages = computed(() => {
    const size = this.pageSize();
    if (size >= 9999) return 1;
    return Math.ceil(this.activeListTotalLength() / size) || 1;
  });

  protected readonly pagedCapitalColocado = computed(() => {
    const list = this.listCapitalColocado();
    const size = this.pageSize();
    if (size >= 9999) return list;
    const start = (this.currentPage() - 1) * size;
    return list.slice(start, start + size);
  });

  protected readonly pagedInteresProyectado = computed(() => {
    const list = this.listInteresProyectado();
    const size = this.pageSize();
    if (size >= 9999) return list;
    const start = (this.currentPage() - 1) * size;
    return list.slice(start, start + size);
  });

  protected readonly pagedCarteraTotal = computed(() => {
    const list = this.listCarteraTotal();
    const size = this.pageSize();
    if (size >= 9999) return list;
    const start = (this.currentPage() - 1) * size;
    return list.slice(start, start + size);
  });

  protected readonly pagedClientesMora = computed(() => {
    const list = this.listClientesMora();
    const size = this.pageSize();
    if (size >= 9999) return list;
    const start = (this.currentPage() - 1) * size;
    return list.slice(start, start + size);
  });

  protected readonly pagedCapitalHistorico = computed(() => {
    const list = this.listCapitalHistorico();
    const size = this.pageSize();
    if (size >= 9999) return list;
    const start = (this.currentPage() - 1) * size;
    return list.slice(start, start + size);
  });

  protected readonly pagedCapitalVivo = computed(() => {
    const list = this.listCapitalVivo();
    const size = this.pageSize();
    if (size >= 9999) return list;
    const start = (this.currentPage() - 1) * size;
    return list.slice(start, start + size);
  });

  protected setPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  protected nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
    }
  }

  protected prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
    }
  }

  protected setPageSize(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  protected toggleSort(column: string): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
  }

  protected clearSearch(): void {
    this.kpiTableSearch.set('');
    this.currentPage.set(1);
  }

  protected navigateToLoans(): void {
    const mod = this.tabsService.catalogoModulos.find(m => m.id === 'prestamos');
    if (mod) {
      this.tabsService.openModulo(mod);
    }
  }

  protected navigateToClients(): void {
    const mod = this.tabsService.catalogoModulos.find(m => m.id === 'clientes');
    if (mod) {
      this.tabsService.openModulo(mod);
    }
  }

  ngOnInit(): void {
    // Inicializar fechas por defecto en 'todos' para ver de inmediato todos los registros
    this.selectFilter('todos');
    
    // Cargar datos estáticos iniciales
    this.cargarResumenCartera();
    this.cargarDeudoresMora();
    this.cargarCuentas();
    this.cargarMovimientosContables();
    this.cargarPagos();
    this.cargarPrestamos();
  }

  protected selectKpiCard(type: KpiReportType): void {
    this.selectedKpiTab.set(type);
    this.kpiTableSearch.set('');
    this.scrollToSection('reporte-detallado-section');
  }

  private normalizeLoan(p: PrestamoResponse): PrestamoResponse {
    let totalPagar = 0;
    let totalPagado = 0;
    let cuotasAtrasadasCount = 0;

    if (p.cuotas && p.cuotas.length > 0) {
      totalPagar = p.cuotas.reduce((sum: number, c: any) => sum + (c.montoPrincipal + c.montoInteres + (c.montoMoratorio || 0)), 0);
      totalPagado = p.cuotas.reduce((sum: number, c: any) => sum + ((c.montoPagadoPrincipal || 0) + (c.montoPagadoInteres || 0) + (c.montoPagadoMora || 0)), 0);

      const hoyDate = new Date();
      hoyDate.setHours(0, 0, 0, 0);

      const cuotasVencidas = p.cuotas.filter((c: any) => {
        const fechaVenc = new Date(c.fechaVencimiento);
        fechaVenc.setHours(0, 0, 0, 0);
        const totalCuota = c.montoPrincipal + c.montoInteres + (c.montoMoratorio || 0);
        const pagadoCuota = (c.montoPagadoPrincipal || 0) + (c.montoPagadoInteres || 0) + (c.montoPagadoMora || 0);
        const saldoCuota = totalCuota - pagadoCuota;
        return (c.estado === 'Vencido' || fechaVenc <= hoyDate) && c.estado !== 'Pagado' && saldoCuota > 0.05;
      });

      cuotasAtrasadasCount = cuotasVencidas.length;
    } else {
      totalPagar = p.cuotaMonto * p.plazoCuotas;
      totalPagado = p.cuotaMonto * (p.cuotasPagadas || 0);
    }

    const saldoRestante = Math.max(0, totalPagar - totalPagado);
    const estaTotalmentePagado = saldoRestante <= 0.05 || (p.cuotas && p.cuotas.length > 0 && p.cuotas.every(c => c.estado === 'Pagado'));

    let calculatedStatus: 'Activo' | 'Pagado' | 'Mora' = 'Activo';
    if (estaTotalmentePagado) {
      calculatedStatus = 'Pagado';
    } else if (cuotasAtrasadasCount > 0 || p.status === 'Mora') {
      calculatedStatus = 'Mora';
    }

    return {
      ...p,
      status: calculatedStatus
    };
  }

  protected cargarPrestamos(): void {
    this.apiPrestamosService.getPrestamos().subscribe({
      next: (res) => {
        this.prestamos.set(res.map(p => this.normalizeLoan(p)));
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error al cargar prestamos en reportes', err);
        this.isLoading.set(false);
      }
    });
  }

  protected cargarPagos(): void {
    this.apiPagosService.getPagos().subscribe({
      next: (res) => this.pagos.set(res),
      error: (err) => console.error('Error al cargar pagos en reportes', err)
    });
  }

  protected cargarResumenCartera(): void {
    this.apiReportesService.getCartera().subscribe({
      next: (res) => {
        this.kpiCartera.set(res);
        this.isLoading.set(false);
      },
      error: (err) => console.error('Error al cargar resumen cartera', err)
    });
  }

  protected cargarDeudoresMora(): void {
    this.apiReportesService.getDeudoresMora().subscribe({
      next: (res) => this.deudoresMora.set(res),
      error: (err) => console.error('Error al cargar deudores en mora', err)
    });
  }

  protected cargarCuentas(): void {
    this.apiCajaService.getCuentas().subscribe({
      next: (res) => {
        // Asignar colores de borde dinámicos a las cuentas
        const mapped = res.map(c => ({
          nombre: c.nombre,
          tipo: c.tipo,
          saldo: c.saldo,
          colorClase: c.tipo === 'Caja' ? 'border-blue' : 'border-orange'
        }));
        this.cuentasFinancieras.set(mapped);
      },
      error: (err) => console.error('Error al cargar cuentas financieras', err)
    });
  }

  protected cargarMovimientosContables(): void {
    this.apiCajaService.getTransacciones().subscribe({
      next: (res) => {
        // Mostrar solo los últimos 5 movimientos en la vista simplificada
        this.movimientosContables.set(res.slice(0, 5));
      },
      error: (err) => console.error('Error al cargar movimientos contables', err)
    });
  }

  protected cargarIngresosPeriodo(): void {
    this.apiReportesService.getIngresos(this.startDate(), this.endDate()).subscribe({
      next: (res) => this.rawIngresos.set(res),
      error: (err) => console.error('Error al cargar ingresos por período', err)
    });
  }

  protected selectFilter(filter: 'hoy' | 'semana' | 'mes' | 'año' | 'todos'): void {
    this.selectedFilter.set(filter);
    
    const today = new Date();
    const format = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    this.endDate.set(format(today));

    if (filter === 'hoy') {
      this.startDate.set(format(today));
    } else if (filter === 'semana') {
      const past = new Date();
      past.setDate(today.getDate() - 7);
      this.startDate.set(format(past));
    } else if (filter === 'mes') {
      const past = new Date();
      past.setMonth(today.getMonth() - 1);
      this.startDate.set(format(past));
    } else if (filter === 'año') {
      const past = new Date();
      past.setFullYear(today.getFullYear() - 1);
      this.startDate.set(format(past));
    } else {
      this.startDate.set('2020-01-01');
    }

    // Refrescar ingresos contables del periodo elegido
    this.cargarIngresosPeriodo();
  }

  protected onDateChange(): void {
    this.selectedFilter.set('todos');
    this.cargarIngresosPeriodo();
  }

  protected scrollToSection(sectionId: string): void {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // =========================================================================
  // EXPORTACIÓN A EXCEL / CSV PARA CADA REPORTE INDIVIDUAL
  // =========================================================================

  private downloadCsv(filename: string, csvContent: string): void {
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  protected exportReportExcel(tab: KpiReportType, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const todayStr = new Date().toISOString().split('T')[0];
    const period = `${this.startDate()} al ${this.endDate()}`;
    const rows: string[] = ['sep=,'];

    switch (tab) {
      case 'colocado': {
        rows.push(`PrestaFlow - Reporte de Capital Colocado (${period})`);
        rows.push(`Fecha de Generación: ${new Date().toLocaleString('es-HN')}`);
        rows.push('');
        rows.push('Código Préstamo,Cliente,Teléfono,Capital (L.),Tasa Interés %,Cuota Pactada (L.),Plazo Cuotas,Frecuencia,Tipo Préstamo,Método Desembolso,Fecha Otorgado,Estado');
        
        this.listCapitalColocado().forEach(l => {
          rows.push([
            l.codigo,
            `"${(l.clienteNombre || '').replace(/"/g, '""')}"`,
            `"${(l.clientePhone || '').replace(/"/g, '""')}"`,
            (l.capital || 0).toFixed(2),
            `${l.interesPorcentaje || 0}%`,
            (l.cuotaMonto || 0).toFixed(2),
            (l.plazoCuotas || 0).toString(),
            l.frecuencia,
            l.tipoPrestamo,
            l.metodoDesembolso,
            l.fechaOtorgado ? l.fechaOtorgado.split('T')[0] : '',
            l.status
          ].join(','));
        });

        this.downloadCsv(`Reporte_Capital_Colocado_${todayStr}.csv`, rows.join('\n'));
        break;
      }

      case 'interes': {
        rows.push(`PrestaFlow - Reporte de Intereses y Rendimiento Proyectado (${period})`);
        rows.push(`Fecha de Generación: ${new Date().toLocaleString('es-HN')}`);
        rows.push('');
        rows.push('Código Préstamo,Cliente,Capital Base (L.),Tasa Interés %,Interés Total Proyectado (L.),Interés Cobrado (L.),Interés Pendiente (L.),Cuotas Pagadas,Estado');

        this.listInteresProyectado().forEach(l => {
          rows.push([
            l.codigo,
            `"${(l.clienteNombre || '').replace(/"/g, '""')}"`,
            (l.capital || 0).toFixed(2),
            `${l.interesPorcentaje || 0}%`,
            (l.interesTotal || 0).toFixed(2),
            (l.interesCobrado || 0).toFixed(2),
            (l.interesPendiente || 0).toFixed(2),
            `${l.cuotasPagadas}/${l.plazoCuotas}`,
            l.status
          ].join(','));
        });

        this.downloadCsv(`Reporte_Interes_Proyectado_${todayStr}.csv`, rows.join('\n'));
        break;
      }

      case 'cartera': {
        rows.push(`PrestaFlow - Reporte de Cartera Total y Retorno Esperado (${period})`);
        rows.push(`Fecha de Generación: ${new Date().toLocaleString('es-HN')}`);
        rows.push('');
        rows.push('Código Préstamo,Cliente,Capital Inicial (L.),Interés Pactado (L.),Total a Cobrar (L.),Total Abonado (L.),Saldo Restante (L.),Avance %,Estado');

        this.listCarteraTotal().forEach(l => {
          rows.push([
            l.codigo,
            `"${(l.clienteNombre || '').replace(/"/g, '""')}"`,
            (l.capital || 0).toFixed(2),
            (l.interesTotal || 0).toFixed(2),
            (l.totalACobrar || 0).toFixed(2),
            (l.totalAbonado || 0).toFixed(2),
            (l.saldoRestante || 0).toFixed(2),
            `${(l.porcentajeAvance || 0).toFixed(1)}%`,
            l.status
          ].join(','));
        });

        this.downloadCsv(`Reporte_Cartera_Total_${todayStr}.csv`, rows.join('\n'));
        break;
      }

      case 'mora': {
        rows.push(`PrestaFlow - Reporte de Gestión de Clientes en Mora (${new Date().toLocaleDateString('es-HN')})`);
        rows.push(`Fecha de Generación: ${new Date().toLocaleString('es-HN')}`);
        rows.push('');
        rows.push('Cliente,Identidad,Código Préstamo,Cuotas Vencidas,Días de Retraso,Monto Vencido (L.),Nivel de Riesgo');

        this.listClientesMora().forEach(d => {
          rows.push([
            `"${(d.clienteNombre || '').replace(/"/g, '""')}"`,
            `="${d.clienteIdentidad}"`,
            d.prestamoCodigo,
            d.cuotasVencidas.toString(),
            `${d.diasRetraso} días`,
            (d.montoAtrasado || 0).toFixed(2),
            d.nivelRiesgo
          ].join(','));
        });

        this.downloadCsv(`Reporte_Clientes_Mora_${todayStr}.csv`, rows.join('\n'));
        break;
      }

      case 'historico': {
        rows.push(`PrestaFlow - Reporte de Capital Histórico Prestado (Historial Completo)`);
        rows.push(`Fecha de Generación: ${new Date().toLocaleString('es-HN')}`);
        rows.push('');
        rows.push('Código Préstamo,Cliente,Teléfono,Capital Colocado (L.),Interés %,Cuotas,Frecuencia,Método Desembolso,Tipo Interés,Tasa Mora %,Fecha Otorgado,Estado');

        this.listCapitalHistorico().forEach(l => {
          rows.push([
            l.codigo,
            `"${(l.clienteNombre || '').replace(/"/g, '""')}"`,
            `"${(l.clientePhone || '').replace(/"/g, '""')}"`,
            (l.capital || 0).toFixed(2),
            `${l.interesPorcentaje || 0}%`,
            (l.plazoCuotas || 0).toString(),
            l.frecuencia,
            l.metodoDesembolso,
            l.tipoInteres,
            `${l.tasaMoraPorcentaje || 0}%`,
            l.fechaOtorgado ? l.fechaOtorgado.split('T')[0] : '',
            l.status
          ].join(','));
        });

        this.downloadCsv(`Reporte_Capital_Historico_Completo_${todayStr}.csv`, rows.join('\n'));
        break;
      }

      case 'vivo': {
        rows.push(`PrestaFlow - Reporte de Capital Vivo Actual y Saldos Pendientes en Calle`);
        rows.push(`Fecha de Generación: ${new Date().toLocaleString('es-HN')}`);
        rows.push('');
        rows.push('Código Préstamo,Cliente,Teléfono,Capital Original (L.),Capital Recuperado (L.),Capital Vivo Pendiente (L.),Cuotas Restantes,Estado');

        this.listCapitalVivo().forEach(l => {
          rows.push([
            l.codigo,
            `"${(l.clienteNombre || '').replace(/"/g, '""')}"`,
            `"${(l.clientePhone || '').replace(/"/g, '""')}"`,
            (l.capitalOriginal || 0).toFixed(2),
            (l.capitalRecuperado || 0).toFixed(2),
            (l.capitalVivoPendiente || 0).toFixed(2),
            (l.cuotasRestantes || 0).toString(),
            l.status
          ].join(','));
        });

        this.downloadCsv(`Reporte_Capital_Vivo_Actual_${todayStr}.csv`, rows.join('\n'));
        break;
      }
    }
  }

  protected exportActiveReportToExcel(): void {
    this.exportReportExcel(this.selectedKpiTab());
  }

  protected exportToExcel(): void {
    this.exportActiveReportToExcel();
  }

  protected exportMovimientosToExcel(): void {
    const todayStr = new Date().toLocaleDateString('es-HN');
    const periodStr = `${this.startDate()} al ${this.endDate()}`;

    const csvRows: string[] = [];
    csvRows.push('sep=,');

    csvRows.push('PrestaFlow - Diario de Movimientos de Cajas y Bancos');
    csvRows.push(`Fecha de Emisión: ${todayStr}`);
    csvRows.push(`Rango de Fecha: ${periodStr}`);
    csvRows.push('');

    csvRows.push('Fecha y Hora,Cuenta / Caja Afectada,Tipo Movimiento,Detalle / Concepto,Monto (L.)');

    this.movimientosContables().forEach(m => {
      const sign = m.tipo === 'Ingreso' ? '+' : '-';
      const row = [
        m.fecha,
        m.cuentaNombre,
        m.tipo,
        m.concepto,
        `${sign}L. ${m.monto.toFixed(2)}`
      ];
      csvRows.push(row.map(val => `"${val.replace(/"/g, '""')}"`).join(','));
    });

    this.downloadCsv(`Diario_Movimientos_PrestaFlow_${new Date().toISOString().split('T')[0]}.csv`, csvRows.join('\n'));
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
