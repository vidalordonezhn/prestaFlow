import { Component, inject, signal, computed, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiAuthService } from '../services/api-auth.service';
import { ApiReportesService, ResumenCartera, IngresosReporte, MoraDeudor } from '../services/api-reportes.service';
import { ApiCajaService, CuentaResponse, TransaccionResponse } from '../services/api-caja.service';
import { ApiPagosService, PagoResponse } from '../services/api-pagos.service';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss'
})
export class ReportsComponent implements OnInit {
  protected readonly auth = inject(ApiAuthService);
  private readonly router = inject(Router);
  private readonly apiReportesService = inject(ApiReportesService);
  private readonly apiCajaService = inject(ApiCajaService);
  private readonly apiPagosService = inject(ApiPagosService);

  // Sidebar User Dropdown Menu
  protected readonly showUserDropdown = signal<boolean>(false);

  protected readonly menuItems = [
    { name: 'Dashboard', icon: 'dashboard', active: false, route: '/' },
    { name: 'Cobros de Hoy', icon: 'route', active: false, route: '/cobros' },
    { name: 'Préstamos', icon: 'currency_exchange', active: false, route: '/prestamos' },
    { name: 'Clientes', icon: 'people', active: false, route: '/clientes' },
    { name: 'Historial de Pagos', icon: 'receipt_long', active: false, route: '/pagos' },
    { name: 'Caja y Bancos', icon: 'account_balance', active: false, route: '/caja-bancos' },
    { name: 'Reportes', icon: 'analytics', active: true, route: '/reportes' },
    { name: 'Configuración', icon: 'settings', active: false, route: '/configuracion' }
  ];

  // Rango de fechas y filtro seleccionado
  protected readonly selectedFilter = signal<'hoy' | 'semana' | 'mes' | 'año' | 'todos'>('mes');
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

  ngOnInit(): void {
    // Inicializar fechas por defecto (Último Mes)
    this.selectFilter('mes');
    
    // Cargar datos estáticos iniciales
    this.cargarResumenCartera();
    this.cargarDeudoresMora();
    this.cargarCuentas();
    this.cargarMovimientosContables();
    this.cargarPagos();
  }

  protected cargarPagos(): void {
    this.apiPagosService.getPagos().subscribe({
      next: (res) => this.pagos.set(res),
      error: (err) => console.error('Error al cargar pagos en reportes', err)
    });
  }

  protected cargarResumenCartera(): void {
    this.apiReportesService.getCartera().subscribe({
      next: (res) => this.kpiCartera.set(res),
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
    const format = (d: Date) => d.toISOString().split('T')[0];

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
      this.startDate.set('2026-01-01');
    }

    // Refrescar ingresos contables del periodo elegido
    this.cargarIngresosPeriodo();
  }

  protected onDateChange(): void {
    this.selectedFilter.set('todos');
    this.cargarIngresosPeriodo();
  }

  protected exportToExcel(): void {
    const todayStr = new Date().toLocaleDateString('es-HN');
    const filterLabel = this.selectedFilter().toUpperCase();
    const periodStr = `${this.startDate()} al ${this.endDate()}`;

    const csvRows: string[] = [];
    csvRows.push('sep=,'); // Force Excel to recognize comma as the separator

    // 1. TÍTULO Y METADATOS
    csvRows.push('PrestaFlow - Reporte de Cartera y Rendimiento');
    csvRows.push(`Fecha de Emisión: ${todayStr}`);
    csvRows.push(`Filtro Aplicado: ${filterLabel} (${periodStr})`);
    csvRows.push('');

    // 2. SECCIÓN: RESUMEN DE CARTERA GLOBAL
    csvRows.push('RESUMEN DE CARTERA GLOBAL');
    csvRows.push('Indicador,Monto / Cantidad');
    csvRows.push(`Capital Colocado en Calle,L. ${this.kpiCartera().capitalColocado.toFixed(2)}`);
    csvRows.push(`Interés Proyectado por Cobrar,L. ${this.kpiCartera().interesPendiente.toFixed(2)}`);
    csvRows.push(`Monto Total de Cartera (Proyectado),L. ${this.kpiCartera().totalProyectado.toFixed(2)}`);
    csvRows.push(`Clientes en Mora Activa,${this.kpiCartera().clientesMoraActiva} deudores`);
    csvRows.push('');

    // 3. SECCIÓN: RENDIMIENTO DE INGRESOS EN EL PERÍODO
    csvRows.push('RENDIMIENTO DE INGRESOS (PERÍODO SELECCIONADO)');
    csvRows.push('Concepto,Monto (L.),Porcentaje');
    csvRows.push(`Retorno de Capital Recuperado,L. ${this.ingresosFiltrados().capital.toFixed(2)},${this.ingresosFiltrados().capitalPercent.toFixed(1)}%`);
    csvRows.push(`Ganancia Neta por Intereses Cobrados,L. ${this.ingresosFiltrados().interes.toFixed(2)},${this.ingresosFiltrados().interesPercent.toFixed(1)}%`);
    csvRows.push(`TOTAL RECAUDADO EN EL PERÍODO,L. ${this.ingresosFiltrados().total.toFixed(2)},100.0%`);
    csvRows.push('');

    // 4. SECCIÓN: SALDOS DE TESORERÍA (Caja Chica y Banco)
    csvRows.push('SALDOS Y DIARIO DE TESORERÍA');
    csvRows.push('Cuenta / Caja,Saldo Actual (L.)');
    this.cuentasFinancieras().forEach(c => {
      csvRows.push(`${c.nombre},L. ${c.saldo.toFixed(2)}`);
    });
    csvRows.push(`BALANCE TOTAL DE EFECTIVO,L. ${this.balanceTotal().toFixed(2)}`);
    csvRows.push('');

    // 5. SECCIÓN: HISTÓRICO CONTABLE (DIARIO DE CAJAS/BANCO)
    csvRows.push('HISTÓRICO CONTABLE (DIARIO DE CAJAS Y BANCO)');
    csvRows.push('Fecha y Hora,Cuenta / Caja,Tipo,Concepto,Monto (L.)');
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
    csvRows.push('');

    // 6. SECCIÓN: TABLA DE CONTROL DE RIESGO DE MORA
    csvRows.push('CONTROL DE RIESGO DE MORA (DETALLE DE DEUDORES)');
    csvRows.push('Nombre de Cliente,Identidad,Código de Préstamo,Cuotas Vencidas,Días de Retraso,Monto Atrasado (L.),Nivel de Riesgo');

    this.deudoresMora().forEach(d => {
      const row = [
        d.clienteNombre,
        `="${d.clienteIdentidad}"`,
        d.prestamoCodigo,
        d.cuotasVencidas.toString(),
        `${d.diasRetraso} días`,
        `L. ${d.montoAtrasado.toFixed(2)}`,
        d.nivelRiesgo
      ];
      csvRows.push(row.map(val => `"${val.replace(/"/g, '""')}"`).join(','));
    });
    csvRows.push('');

    // 7. SECCIÓN: DETALLE DE ABONOS RECIBIDOS
    csvRows.push('DETALLE DE ABONOS RECIBIDOS (PERÍODO SELECCIONADO)');
    csvRows.push('Fecha,Cód. Transacción,Cód. Préstamo,Nombre Cliente,Identidad,Método Pago,Referencia,Abono Principal (L.),Abono Interés (L.),Cargos Mora (L.),Monto Total (L.)');

    const start = new Date(this.startDate() + 'T00:00:00');
    const end = new Date(this.endDate() + 'T23:59:59');
    
    const abonosPeriodo = this.pagos().filter(p => {
      const d = new Date(p.fechaPago);
      return d >= start && d <= end;
    });

    abonosPeriodo.forEach(p => {
      const row = [
        new Date(p.fechaPago).toLocaleDateString('es-HN'),
        `TX-${p.id}`,
        p.prestamoCodigo,
        p.clienteNombre,
        `="${p.clienteIdentidad}"`,
        p.metodoPago,
        p.referencia || '',
        `L. ${p.montoPrincipal.toFixed(2)}`,
        `L. ${p.montoInteres.toFixed(2)}`,
        `L. ${p.montoMora.toFixed(2)}`,
        `L. ${p.monto.toFixed(2)}`
      ];
      csvRows.push(row.map(val => `"${val.replace(/"/g, '""')}"`).join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Reporte_Cartera_PrestaFlow_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  protected exportMovimientosToExcel(): void {
    const todayStr = new Date().toLocaleDateString('es-HN');
    const filterLabel = this.selectedFilter().toUpperCase();
    const periodStr = `${this.startDate()} al ${this.endDate()}`;

    const csvRows: string[] = [];
    csvRows.push('sep=,'); // Force Excel to recognize comma as the separator

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

    const csvContent = csvRows.join('\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Diario_Movimientos_PrestaFlow_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
