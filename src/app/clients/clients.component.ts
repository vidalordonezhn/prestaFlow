import { Component, OnInit, signal, computed, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { ApiClientsService, ClienteResponse, ClienteCreate } from '../services/api-clients.service';
import { ApiAuthService } from '../services/api-auth.service';

interface Client {
  dbId: number;
  id: string; // Identidad / Cédula
  name: string;
  phone: string;
  address: string;
  zone: string;
  refName: string;
  refPhone: string;
  loansCount: number;
  balance: number;
  status: 'Al Día' | 'En Mora' | 'Sin Crédito';
  score: 'Excelente' | 'Regular' | 'Mora' | 'Nuevo';
  prestamosHistory?: any[]; // Historial detallado opcional
}

interface Toast {
  id: number;
  type: 'success' | 'info' | 'warning';
  title: string;
  message: string;
}

// Función auxiliadora de mapeo de API DTO a Interface de Interfaz
const mapToClient = (res: ClienteResponse): Client => ({
  dbId: res.id,
  id: res.identidad,
  name: res.nombre,
  phone: res.phone,
  address: res.address,
  zone: res.zone,
  refName: res.refName,
  refPhone: res.refPhone,
  loansCount: res.loansCount,
  balance: res.balance,
  status: res.status,
  score: res.score,
  prestamosHistory: res.prestamosHistory
});

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './clients.component.html',
  styleUrl: './clients.component.scss'
})
export class ClientsComponent implements OnInit {
  private readonly apiClientsService = inject(ApiClientsService);
  protected readonly auth = inject(ApiAuthService);
  private readonly router = inject(Router);

  // Current Date
  protected readonly currentDate = signal(new Date());

  // Sidebar User Dropdown Menu
  protected readonly showUserDropdown = signal<boolean>(false);

  // Search and Filter Signals
  protected readonly searchQuery = signal('');
  protected readonly statusFilter = signal<'all' | 'al-dia' | 'mora' | 'sin-credito'>('all');

  // Toasts
  protected readonly toasts = signal<Toast[]>([]);
  private toastIdCounter = 0;

  // Modals Visibility
  protected readonly showCreateModal = signal(false);
  protected readonly showDetailsModal = signal(false);

  // Selected Client for profile sheet view
  protected readonly selectedClient = signal<Client | null>(null);

  // New Client Form Signals
  protected readonly newClientName = signal('');
  protected readonly newClientId = signal('');
  protected readonly newClientPhone = signal('');
  protected readonly newClientAddress = signal('');
  protected readonly newClientZone = signal('Tegucigalpa - Centro');
  protected readonly newClientRefName = signal('');
  protected readonly newClientRefPhone = signal('');

  // Primary list of Clients (Reactive from DB)
  protected readonly clients = signal<Client[]>([]);

  // Sidebar Menu Items
  protected readonly menuItems = [
    { name: 'Dashboard', icon: 'dashboard', active: false, route: '/' },
    { name: 'Cobros de Hoy', icon: 'route', active: false, route: '/cobros' },
    { name: 'Préstamos', icon: 'currency_exchange', active: false, route: '/prestamos' },
    { name: 'Clientes', icon: 'people', active: true, route: '/clientes' },
    { name: 'Historial de Pagos', icon: 'receipt_long', active: false, route: '/pagos' },
    { name: 'Caja y Bancos', icon: 'account_balance', active: false, route: '/caja-bancos' },
    { name: 'Reportes', icon: 'analytics', active: false, route: '/reportes' },
    { name: 'Configuración', icon: 'settings', active: false, route: '/configuracion' }
  ];

  ngOnInit(): void {
    this.cargarClientes();
  }

  /**
   * Consulta la lista completa de deudores desde la API.
   */
  private cargarClientes(): void {
    this.apiClientsService.getClientes().subscribe({
      next: (res) => {
        this.clients.set(res.map(mapToClient));
      },
      error: (err) => {
        this.triggerToast(
          'warning',
          'Error de Conexión',
          'No se pudo comunicar con el servidor de la API o no estás autenticado.'
        );
      }
    });
  }

  // Computed KPIs for Clients Screen
  protected readonly kpiTotalClientes = computed(() => {
    return this.clients().length;
  });

  protected readonly kpiClientesActivos = computed(() => {
    return this.clients().filter(c => c.status === 'Al Día' || c.status === 'En Mora').length;
  });

  protected readonly kpiClientesMora = computed(() => {
    return this.clients().filter(c => c.status === 'En Mora').length;
  });

  protected readonly kpiNuevosDelMes = computed(() => {
    return this.clients().filter(c => c.score === 'Nuevo').length;
  });

  // Filtered Clients list
  protected readonly filteredClients = computed(() => {
    let result = this.clients();

    // Text search
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      result = result.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.id.includes(query) || 
        c.phone.includes(query)
      );
    }

    // Status filter pills
    const filter = this.statusFilter();
    if (filter !== 'all') {
      if (filter === 'al-dia') {
        result = result.filter(c => c.status === 'Al Día');
      } else if (filter === 'mora') {
        result = result.filter(c => c.status === 'En Mora');
      } else if (filter === 'sin-credito') {
        result = result.filter(c => c.status === 'Sin Crédito');
      }
    }

    return result;
  });

  // Computations for Selected Client Lifetime Indicators (Modal)
  protected readonly selectedClientLoans = computed<any[]>(() => {
    return this.selectedClient()?.prestamosHistory || [];
  });

  protected readonly clientTotalPrestado = computed(() => {
    return this.selectedClientLoans().reduce((acc, curr) => acc + curr.amount, 0);
  });

  protected readonly clientTotalInteres = computed(() => {
    return this.selectedClientLoans().reduce((acc, curr) => acc + (curr.amount * (curr.interest / 100)), 0);
  });

  protected readonly clientTotalAdeudado = computed(() => {
    return this.selectedClient()?.balance || 0;
  });

  protected readonly clientTotalPagado = computed(() => {
    const totalToPay = this.clientTotalPrestado() + this.clientTotalInteres();
    const remaining = this.clientTotalAdeudado();
    return Math.max(0, totalToPay - remaining);
  });

  // Handlers
  protected onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  // Open details profile sheet (queries full details from API)
  protected openDetails(client: Client): void {
    this.apiClientsService.getCliente(client.dbId).subscribe({
      next: (res) => {
        this.selectedClient.set({
          ...client,
          prestamosHistory: res.prestamosHistory.map(p => ({
            loanId: p.loanId,
            amount: p.amount,
            interest: p.interest,
            date: new Date(p.date), // Parse ISO String to Date
            status: p.status,
            cuotas: p.cuotas
          }))
        });
        this.showDetailsModal.set(true);
      },
      error: (err) => {
        this.triggerToast('warning', 'Error de Carga', 'No se pudo obtener el historial detallado.');
      }
    });
  }

  // Open Create Modal
  protected openCreateClient(): void {
    this.newClientName.set('');
    this.newClientId.set('');
    this.newClientPhone.set('');
    this.newClientAddress.set('');
    this.newClientZone.set('Tegucigalpa - Centro');
    this.newClientRefName.set('');
    this.newClientRefPhone.set('');
    this.showCreateModal.set(true);
  }

  // Save new client to API
  protected submitClient(): void {
    const name = this.newClientName().trim();
    const id = this.newClientId().trim();
    const phone = this.newClientPhone().trim();
    const address = this.newClientAddress().trim();
    const zone = this.newClientZone();
    const refName = this.newClientRefName().trim();
    const refPhone = this.newClientRefPhone().trim();

    if (!name || !id) {
      this.triggerToast('warning', 'Campos Incompletos', 'Nombre e Identidad son campos obligatorios.');
      return;
    }

    if (id.length < 8) {
      this.triggerToast('warning', 'Identidad Inválida', 'Ingrese un número de identidad o cédula válido.');
      return;
    }

    const clientDto: ClienteCreate = {
      identidad: id,
      nombre: name,
      phone: phone || '+504 9999-9999',
      address: address || 'No especificada',
      zone,
      refName: refName || 'No especificado',
      refPhone: refPhone || 'No especificado'
    };

    this.apiClientsService.createCliente(clientDto).subscribe({
      next: (res) => {
        const newClient = mapToClient(res);
        
        // Agregar al tope de la lista reactiva
        this.clients.update(current => [newClient, ...current]);

        this.triggerToast(
          'success',
          'Cliente Registrado',
          `El perfil del cliente ${name} ha sido creado con éxito.`
        );

        this.showCreateModal.set(false);
      },
      error: (err) => {
        const msg = err.error?.mensaje || 'No se pudo registrar el cliente en el servidor.';
        this.triggerToast('warning', 'Error del Servidor', msg);
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

  protected onLogout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
