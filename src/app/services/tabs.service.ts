import { Injectable, computed, inject, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ApiAuthService } from './api-auth.service';
import { PermissionsService } from './permissions.service';

export interface ModuloItem {
  id: string;
  title: string;
  shortTitle: string;
  route: string;
  category: string;
  description: string;
  iconPath: string;
  closable: boolean;
  adminOnly?: boolean;
}

export interface CategoriaGroup {
  category: string;
  items: ModuloItem[];
}

@Injectable({
  providedIn: 'root'
})
export class TabsService {
  private readonly router = inject(Router);
  private readonly auth = inject(ApiAuthService);
  private readonly permissions = inject(PermissionsService);

  // Catálogo maestro de todas las rutas y pantallas de la aplicación
  readonly catalogoModulos: ModuloItem[] = [
    {
      id: 'dashboard',
      title: 'Panel de Control Principal',
      shortTitle: 'Dashboard',
      route: '/',
      category: 'Principal',
      description: 'Resumen ejecutivo de cartera, cobranzas del día y gráficos en tiempo real.',
      iconPath: 'dashboard',
      closable: false
    },
    {
      id: 'cobros',
      title: 'Cobros de Hoy y Ruta',
      shortTitle: 'Cobros de Hoy',
      route: '/cobros',
      category: 'Operaciones',
      description: 'Gestión de ruta diaria, cobros programados y registro rápido de abonos.',
      iconPath: 'route',
      closable: true
    },
    {
      id: 'prestamos',
      title: 'Gestión de Préstamos',
      shortTitle: 'Préstamos',
      route: '/prestamos',
      category: 'Gestión de Cartera',
      description: 'Colocación de créditos, cálculo de cuotas y cronogramas de amortización.',
      iconPath: 'currency_exchange',
      closable: true
    },
    {
      id: 'clientes',
      title: 'Directorio de Clientes',
      shortTitle: 'Clientes',
      route: '/clientes',
      category: 'Gestión de Cartera',
      description: 'Padrón de prestatarios, expedientes, historial de crédito y avales.',
      iconPath: 'people',
      closable: true
    },
    {
      id: 'pagos',
      title: 'Historial de Pagos',
      shortTitle: 'Historial Pagos',
      route: '/pagos',
      category: 'Operaciones',
      description: 'Registro cronológico de transacciones, recibos y métodos de pago.',
      iconPath: 'receipt_long',
      closable: true
    },
    {
      id: 'caja-bancos',
      title: 'Caja y Bancos',
      shortTitle: 'Caja y Bancos',
      route: '/caja-bancos',
      category: 'Tesorería',
      description: 'Control de cuentas bancarias, flujo de caja, ingresos y egresos.',
      iconPath: 'account_balance',
      closable: true,
      adminOnly: true
    },
    {
      id: 'reportes',
      title: 'Reportes y Analítica',
      shortTitle: 'Reportes',
      route: '/reportes',
      category: 'Tesorería',
      description: 'Métricas financieras, rendimiento de cartera, balances y exportaciones.',
      iconPath: 'analytics',
      closable: true,
      adminOnly: true
    },
    {
      id: 'configuracion',
      title: 'Configuración del Sistema',
      shortTitle: 'Configuración',
      route: '/configuracion',
      category: 'Sistema',
      description: 'Parámetros del negocio, gestión de usuarios, roles y seguridad.',
      iconPath: 'settings',
      closable: true,
      adminOnly: true
    }
  ];

  // Estado Reactivo con Signals
  readonly tabs = signal<ModuloItem[]>([this.catalogoModulos[0]]);
  readonly activeTabId = signal<string>('dashboard');
  readonly searchOpen = signal<boolean>(false);
  readonly searchQuery = signal<string>('');

  // Módulos visibles según los permisos dinámicos del usuario
  readonly modulosDisponibles = computed<ModuloItem[]>(() => {
    const user = this.auth.currentUser();
    if (!user) return [];

    return this.catalogoModulos.filter(modulo => {
      // Si es Admin tiene acceso a todo, de lo contrario según sus permisos dinámicos
      if (user.rol === 'Admin') return true;
      return this.permissions.canAccessRoute(modulo.route);
    });
  });

  // Computed Signal: Filtro de módulos por búsqueda en título, descripción o categoría
  readonly modulosFiltrados = computed<ModuloItem[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const disponibles = this.modulosDisponibles();

    if (!query) {
      return disponibles;
    }

    return disponibles.filter(m =>
      m.title.toLowerCase().includes(query) ||
      m.shortTitle.toLowerCase().includes(query) ||
      m.description.toLowerCase().includes(query) ||
      m.category.toLowerCase().includes(query)
    );
  });

  // Computed Signal: Agrupación de módulos filtrados por categoría
  readonly categoriasGroup = computed<CategoriaGroup[]>(() => {
    const filtrados = this.modulosFiltrados();
    const groupsMap = new Map<string, ModuloItem[]>();

    for (const modulo of filtrados) {
      const items = groupsMap.get(modulo.category) || [];
      items.push(modulo);
      groupsMap.set(modulo.category, items);
    }

    const groups: CategoriaGroup[] = [];
    groupsMap.forEach((items, category) => {
      groups.push({ category, items });
    });

    return groups;
  });

  constructor() {
    // Sincronización automática con router.events para navegación directa o interna
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        const currentUrl = event.urlAfterRedirects || event.url;
        this.syncTabFromUrl(currentUrl);
      });
  }

  /**
   * Abre un módulo específico: lo agrega a pestañas si no existe y navega a su ruta.
   */
  openModulo(modulo: ModuloItem): void {
    const currentTabs = this.tabs();
    const exists = currentTabs.some(t => t.id === modulo.id);

    if (!exists) {
      this.tabs.set([...currentTabs, modulo]);
    }

    this.activeTabId.set(modulo.id);
    this.closeSearch();
    this.router.navigateByUrl(modulo.route);
  }

  /**
   * Selecciona una pestaña existente y navega a su ruta asociada.
   */
  selectTab(tabId: string): void {
    const tab = this.tabs().find(t => t.id === tabId);
    if (tab) {
      this.activeTabId.set(tabId);
      this.router.navigateByUrl(tab.route);
    }
  }

  /**
   * Cierra una pestaña y cambia el foco a la pestaña vecina si la que se cerró estaba activa.
   */
  closeTab(tabId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    const currentTabs = this.tabs();
    const tabIndex = currentTabs.findIndex(t => t.id === tabId);

    if (tabIndex === -1) return;

    const targetTab = currentTabs[tabIndex];
    if (!targetTab.closable) return; // No se puede cerrar el Dashboard principal

    const newTabs = currentTabs.filter(t => t.id !== tabId);
    this.tabs.set(newTabs);

    // Si la pestaña que se cerró era la activa, cambiar el foco a la vecina
    if (this.activeTabId() === tabId) {
      const nextActiveIndex = tabIndex > 0 ? tabIndex - 1 : 0;
      const nextTab = newTabs[nextActiveIndex] || this.catalogoModulos[0];
      this.activeTabId.set(nextTab.id);
      this.router.navigateByUrl(nextTab.route);
    }
  }

  /**
   * Verifica si una pantalla ya está abierta en las pestañas.
   */
  isTabOpen(moduloId: string): boolean {
    return this.tabs().some(t => t.id === moduloId);
  }

  openSearch(): void {
    this.searchQuery.set('');
    this.searchOpen.set(true);
  }

  closeSearch(): void {
    this.searchOpen.set(false);
    this.searchQuery.set('');
  }

  toggleSearch(): void {
    if (this.searchOpen()) {
      this.closeSearch();
    } else {
      this.openSearch();
    }
  }

  /**
   * Sincroniza la pestaña activa basándose en la URL actual de navegación.
   */
  private syncTabFromUrl(url: string): void {
    const cleanUrl = url.split('?')[0].split('#')[0];
    
    // Buscar coincidencia exacta o por inicio de ruta
    let matched = this.catalogoModulos.find(m => {
      if (m.route === '/') {
        return cleanUrl === '' || cleanUrl === '/';
      }
      return cleanUrl === m.route || cleanUrl.startsWith(m.route + '/');
    });

    if (!matched) {
      matched = this.catalogoModulos[0]; // fallback al Dashboard
    }

    const currentTabs = this.tabs();
    if (!currentTabs.some(t => t.id === matched.id)) {
      this.tabs.set([...currentTabs, matched]);
    }

    this.activeTabId.set(matched.id);
  }
}
