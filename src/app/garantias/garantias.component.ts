import { Component, OnInit, signal, computed, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiGarantiasService, Garantia, CrearGarantiaRequest, ActualizarGarantiaRequest } from '../services/api-garantias.service';
import { ApiClientsService, ClienteResponse } from '../services/api-clients.service';
import { ApiPrestamosService, PrestamoResponse } from '../services/api-prestamos.service';
import { ApiAuthService } from '../services/api-auth.service';
import { PermissionsService } from '../services/permissions.service';
import { SettingsService } from '../services/settings.service';
import { exportToCsv } from '../core/utils/export.utils';

export interface ToastNotification {
  id: number;
  type: 'success' | 'warning' | 'info';
  title: string;
  message: string;
}

@Component({
  selector: 'app-garantias',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './garantias.component.html',
  styleUrls: ['./garantias.component.scss']
})
export class GarantiasComponent implements OnInit {
  private readonly apiGarantias = inject(ApiGarantiasService);
  private readonly apiClients = inject(ApiClientsService);
  private readonly apiPrestamos = inject(ApiPrestamosService);
  protected readonly auth = inject(ApiAuthService);
  protected readonly permissions = inject(PermissionsService);
  protected readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);

  // State Signals
  protected readonly garantias = signal<Garantia[]>([]);
  protected readonly clients = signal<ClienteResponse[]>([]);
  protected readonly prestamos = signal<PrestamoResponse[]>([]);
  protected readonly isLoading = signal(false);

  // Filters
  protected readonly searchQuery = signal('');
  protected readonly selectedEstado = signal<string>('Todos');
  protected readonly selectedTipo = signal<string>('Todos');
  protected readonly currentView = signal<'grid' | 'table'>('grid');

  // Modals State
  protected readonly showCreateModal = signal(false);
  protected readonly showEditModal = signal(false);
  protected readonly showDetailsModal = signal(false);
  protected readonly showStatusModal = signal(false);
  protected readonly showImageModal = signal(false);
  protected readonly showActaModal = signal(false);

  // Selected Garantia for Details / Actions
  protected readonly selectedGarantia = signal<Garantia | null>(null);
  protected readonly previewImageUrl = signal<string | null>(null);

  // Form Signals (Create / Edit)
  protected readonly formClienteId = signal<number | null>(null);
  protected readonly formPrestamoId = signal<number | null>(null);
  protected readonly formTipo = signal<string>('Vehículo');
  protected readonly formDescripcion = signal<string>('');
  protected readonly formNumeroSerie = signal<string>('');
  protected readonly formValorEstimado = signal<number | null>(null);
  protected readonly formUbicacionFisica = signal<string>('Bodega Central');
  protected readonly formFotoUrl = signal<string>('');
  protected readonly formObservaciones = signal<string>('');

  // Status Change Form
  protected readonly newStatus = signal<'En Custodia' | 'Devuelta' | 'En Remate' | 'Liquidada'>('Devuelta');
  protected readonly statusObservaciones = signal<string>('');

  // Toast System
  protected readonly toasts = signal<ToastNotification[]>([]);
  private toastCounter = 0;

  // Types catalogue
  protected readonly tiposGarantia = [
    { value: 'Vehículo', icon: '🚗', label: 'Vehículo / Moto' },
    { value: 'Inmueble / Escritura', icon: '🏠', label: 'Inmueble / Escritura' },
    { value: 'Electrodoméstico', icon: '📺', label: 'Electrodoméstico / Tech' },
    { value: 'Joya / Oro', icon: '💎', label: 'Joya / Oro / Plata' },
    { value: 'Maquinaria / Herramienta', icon: '⚙️', label: 'Maquinaria / Equipo' },
    { value: 'Otro', icon: '📦', label: 'Otro Bien Físico' }
  ];

  // Available loans for selected client in form
  protected readonly clientLoans = computed(() => {
    const cId = this.formClienteId();
    if (!cId) return [];
    return this.prestamos().filter(p => p.clienteId === cId && p.status !== 'Pagado');
  });

  // Filtered Garantias
  protected readonly filteredGarantias = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const estado = this.selectedEstado();
    const tipo = this.selectedTipo();

    return this.garantias().filter(g => {
      // Estado filter
      if (estado !== 'Todos' && g.estadoCustodia !== estado) return false;

      // Tipo filter
      if (tipo !== 'Todos' && g.tipo !== tipo) return false;

      // Query filter
      if (!q) return true;
      return (
        g.codigo.toLowerCase().includes(q) ||
        g.descripcion.toLowerCase().includes(q) ||
        (g.numeroSerie && g.numeroSerie.toLowerCase().includes(q)) ||
        g.clienteNombre.toLowerCase().includes(q) ||
        g.clienteIdentidad.includes(q) ||
        g.ubicacionFisica.toLowerCase().includes(q) ||
        (g.prestamoCodigo && g.prestamoCodigo.toLowerCase().includes(q))
      );
    });
  });

  // KPIs
  protected readonly totalGarantias = computed(() => this.garantias().length);

  protected readonly valorTotalTasado = computed(() => {
    return this.garantias()
      .filter(g => g.estadoCustodia === 'En Custodia' || g.estadoCustodia === 'En Remate')
      .reduce((sum, curr) => sum + Number(curr.valorEstimado), 0);
  });

  protected readonly enCustodiaCount = computed(() => {
    return this.garantias().filter(g => g.estadoCustodia === 'En Custodia').length;
  });

  protected readonly enRemateCount = computed(() => {
    return this.garantias().filter(g => g.estadoCustodia === 'En Remate').length;
  });

  protected readonly devueltasCount = computed(() => {
    return this.garantias().filter(g => g.estadoCustodia === 'Devuelta').length;
  });

  ngOnInit(): void {
    this.cargarDatos();
  }

  protected cargarDatos(): void {
    this.isLoading.set(true);
    this.apiGarantias.getGarantias().subscribe({
      next: (res) => {
        this.garantias.set(res);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error al cargar garantías:', err);
        this.isLoading.set(false);
        this.triggerToast('warning', 'Error de Conexión', 'No se pudieron cargar las garantías registradas.');
      }
    });

    this.apiClients.getClientes().subscribe({
      next: (res: ClienteResponse[]) => this.clients.set(res),
      error: (err: any) => console.error('Error al cargar clientes:', err)
    });

    this.apiPrestamos.getPrestamos().subscribe({
      next: (res) => this.prestamos.set(res),
      error: (err) => console.error('Error al cargar préstamos:', err)
    });
  }

  // Open Create Modal
  protected openCreateModal(): void {
    this.formClienteId.set(null);
    this.formPrestamoId.set(null);
    this.formTipo.set('Vehículo');
    this.formDescripcion.set('');
    this.formNumeroSerie.set('');
    this.formValorEstimado.set(null);
    this.formUbicacionFisica.set('Bodega Central');
    this.formFotoUrl.set('');
    this.formObservaciones.set('');
    this.showCreateModal.set(true);
  }

  // Handle Photo File Upload / Base64 conversion
  protected onPhotoSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      this.triggerToast('warning', 'Archivo muy grande', 'La imagen no debe superar los 3 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.formFotoUrl.set(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  // Submit Create Garantia
  protected submitCreate(): void {
    const clienteId = this.formClienteId();
    const descripcion = this.formDescripcion().trim();
    const valor = this.formValorEstimado();

    if (!clienteId) {
      this.triggerToast('warning', 'Cliente Requerido', 'Selecciona el cliente propietario de la garantía.');
      return;
    }

    if (!descripcion || descripcion.length < 3) {
      this.triggerToast('warning', 'Descripción Requerida', 'Ingresa una descripción clara del bien (mínimo 3 caracteres).');
      return;
    }

    if (!valor || valor <= 0) {
      this.triggerToast('warning', 'Valor Requerido', 'Ingresa un valor de tasación válido mayor a 0.');
      return;
    }

    const payload: CrearGarantiaRequest = {
      clienteId,
      prestamoId: this.formPrestamoId() || null,
      tipo: this.formTipo(),
      descripcion,
      numeroSerie: this.formNumeroSerie().trim() || null,
      valorEstimado: valor,
      ubicacionFisica: this.formUbicacionFisica().trim() || 'Bodega Central',
      fotoUrl: this.formFotoUrl() || null,
      observaciones: this.formObservaciones().trim() || null
    };

    this.apiGarantias.crearGarantia(payload).subscribe({
      next: (res) => {
        this.garantias.update(list => [res, ...list]);
        this.showCreateModal.set(false);
        this.triggerToast('success', 'Garantía Registrada', `La garantía ${res.codigo} ha sido ingresada en custodia.`);
      },
      error: (err) => {
        const msg = err.error?.mensaje || 'No se pudo registrar la garantía.';
        this.triggerToast('warning', 'Error al Registrar', msg);
      }
    });
  }

  // Open Edit Modal
  protected openEditModal(garantia: Garantia, event?: Event): void {
    if (event) event.stopPropagation();
    this.selectedGarantia.set(garantia);
    this.formClienteId.set(garantia.clienteId);
    this.formPrestamoId.set(garantia.prestamoId || null);
    this.formTipo.set(garantia.tipo);
    this.formDescripcion.set(garantia.descripcion);
    this.formNumeroSerie.set(garantia.numeroSerie || '');
    this.formValorEstimado.set(garantia.valorEstimado);
    this.formUbicacionFisica.set(garantia.ubicacionFisica);
    this.formFotoUrl.set(garantia.fotoUrl || '');
    this.formObservaciones.set(garantia.observaciones || '');
    this.showEditModal.set(true);
  }

  // Submit Edit Garantia
  protected submitEdit(): void {
    const garantia = this.selectedGarantia();
    if (!garantia) return;

    const descripcion = this.formDescripcion().trim();
    const valor = this.formValorEstimado();

    if (!descripcion || descripcion.length < 3) {
      this.triggerToast('warning', 'Descripción Requerida', 'Ingresa una descripción clara del bien.');
      return;
    }

    if (!valor || valor <= 0) {
      this.triggerToast('warning', 'Valor Requerido', 'Ingresa un valor de tasación válido mayor a 0.');
      return;
    }

    const payload: ActualizarGarantiaRequest = {
      prestamoId: this.formPrestamoId() || null,
      tipo: this.formTipo(),
      descripcion,
      numeroSerie: this.formNumeroSerie().trim() || null,
      valorEstimado: valor,
      ubicacionFisica: this.formUbicacionFisica().trim() || 'Bodega Central',
      fotoUrl: this.formFotoUrl() || null,
      observaciones: this.formObservaciones().trim() || null
    };

    this.apiGarantias.actualizarGarantia(garantia.id, payload).subscribe({
      next: (res) => {
        this.garantias.update(list => list.map(g => g.id === res.id ? res : g));
        if (this.selectedGarantia()?.id === res.id) {
          this.selectedGarantia.set(res);
        }
        this.showEditModal.set(false);
        this.triggerToast('success', 'Garantía Actualizada', `La información de ${res.codigo} ha sido guardada.`);
      },
      error: (err) => {
        const msg = err.error?.mensaje || 'No se pudo actualizar la garantía.';
        this.triggerToast('warning', 'Error al Actualizar', msg);
      }
    });
  }

  // Open Details Modal
  protected openDetails(garantia: Garantia): void {
    this.selectedGarantia.set(garantia);
    this.showDetailsModal.set(true);
  }

  // Open Status Change Modal
  protected openStatusModal(garantia: Garantia, event?: Event): void {
    if (event) event.stopPropagation();
    this.selectedGarantia.set(garantia);
    this.newStatus.set(garantia.estadoCustodia === 'En Custodia' ? 'Devuelta' : 'En Custodia');
    this.statusObservaciones.set('');
    this.showStatusModal.set(true);
  }

  // Submit Status Change
  protected submitChangeStatus(): void {
    const garantia = this.selectedGarantia();
    if (!garantia) return;

    this.apiGarantias.cambiarEstado(garantia.id, {
      estadoCustodia: this.newStatus(),
      observaciones: this.statusObservaciones().trim() || null
    }).subscribe({
      next: (res) => {
        this.garantias.update(list => list.map(g => g.id === res.id ? res : g));
        this.selectedGarantia.set(res);
        this.showStatusModal.set(false);
        this.triggerToast('success', 'Estado Actualizado', `La garantía ${res.codigo} ahora está '${res.estadoCustodia}'.`);
      },
      error: (err) => {
        const msg = err.error?.mensaje || 'No se pudo cambiar el estado de la garantía.';
        this.triggerToast('warning', 'Error al Cambiar Estado', msg);
      }
    });
  }

  // Open Image Modal
  protected viewImage(url: string, event?: Event): void {
    if (event) event.stopPropagation();
    this.previewImageUrl.set(url);
    this.showImageModal.set(true);
  }

  // Open Printable Acta de Recepción
  protected openActaCustodia(garantia: Garantia, event?: Event): void {
    if (event) event.stopPropagation();
    this.selectedGarantia.set(garantia);
    this.showActaModal.set(true);
  }

  // Print Acta
  protected printActa(): void {
    window.print();
  }

  // Delete Garantia
  protected eliminarGarantia(garantia: Garantia, event?: Event): void {
    if (event) event.stopPropagation();

    if (!confirm(`¿Estás seguro de eliminar el registro de la garantía ${garantia.codigo} (${garantia.descripcion})? Esta acción no se puede deshacer.`)) {
      return;
    }

    this.apiGarantias.eliminarGarantia(garantia.id).subscribe({
      next: () => {
        this.garantias.update(list => list.filter(g => g.id !== garantia.id));
        if (this.selectedGarantia()?.id === garantia.id) {
          this.showDetailsModal.set(false);
          this.selectedGarantia.set(null);
        }
        this.triggerToast('info', 'Garantía Eliminada', `El registro ${garantia.codigo} ha sido removido.`);
      },
      error: (err) => {
        const msg = err.error?.mensaje || 'No se pudo eliminar la garantía.';
        this.triggerToast('warning', 'Error al Eliminar', msg);
      }
    });
  }

  // Export to CSV
  protected exportCsv(): void {
    const list = this.filteredGarantias();
    exportToCsv<Garantia>('Inventario_Garantias_PrestaFlow', list, [
      { header: 'Código', field: 'codigo' },
      { header: 'Cliente', field: 'clienteNombre' },
      { header: 'Identidad', field: 'clienteIdentidad' },
      { header: 'Teléfono', field: 'clientePhone' },
      { header: 'Préstamo Vinculado', format: g => g.prestamoCodigo || 'Sin Préstamo' },
      { header: 'Tipo', field: 'tipo' },
      { header: 'Descripción', field: 'descripcion' },
      { header: 'N° Serie / VIN', format: g => g.numeroSerie || 'N/A' },
      { header: 'Valor Tasación (L.)', field: 'valorEstimado' },
      { header: 'Estado Custodia', field: 'estadoCustodia' },
      { header: 'Ubicación Bodega', field: 'ubicacionFisica' },
      { header: 'Fecha Ingreso', format: g => new Date(g.fechaIngreso).toLocaleDateString('es-HN') },
      { header: 'Fecha Devolución', format: g => g.fechaDevolucion ? new Date(g.fechaDevolucion).toLocaleDateString('es-HN') : 'En Custodia' },
      { header: 'Observaciones', format: g => g.observaciones || '' }
    ]);
  }

  // Get icon by tipo
  protected getIconByTipo(tipo: string): string {
    switch (tipo) {
      case 'Vehículo': return '🚗';
      case 'Inmueble / Escritura': return '🏠';
      case 'Electrodoméstico': return '📺';
      case 'Joya / Oro': return '💎';
      case 'Maquinaria / Herramienta': return '⚙️';
      default: return '📦';
    }
  }

  // Toast Helper
  private triggerToast(type: 'success' | 'warning' | 'info', title: string, message: string): void {
    const id = ++this.toastCounter;
    this.toasts.update(t => [...t, { id, type, title, message }]);
    setTimeout(() => this.removeToast(id), 5000);
  }

  protected removeToast(id: number): void {
    this.toasts.update(t => t.filter(x => x.id !== id));
  }
}
