import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiAuthService } from './api-auth.service';

export interface UserPermissions {
  // Módulos / Pantallas (Navegación)
  verDashboard: boolean;
  verCobros: boolean;
  verPrestamos: boolean;
  verClientes: boolean;
  verGarantias: boolean;
  verPagos: boolean;
  verCajaBancos: boolean;
  verReportes: boolean;
  verConfiguracion: boolean;

  // Acciones y Facultades Operativas
  crearPrestamos: boolean;
  crearClientes: boolean;
  gestionarGarantias: boolean;
  registrarAbonos: boolean;
  anularPagos: boolean;
  exportarExcel: boolean;
}

export const ADMIN_PRESET: UserPermissions = {
  verDashboard: true,
  verCobros: true,
  verPrestamos: true,
  verClientes: true,
  verGarantias: true,
  verPagos: true,
  verCajaBancos: true,
  verReportes: true,
  verConfiguracion: true,
  crearPrestamos: true,
  crearClientes: true,
  gestionarGarantias: true,
  registrarAbonos: true,
  anularPagos: true,
  exportarExcel: true
};

export const COBRADOR_PRESET: UserPermissions = {
  verDashboard: true,
  verCobros: true,
  verPrestamos: true,
  verClientes: true,
  verGarantias: true,
  verPagos: true,
  verCajaBancos: false,
  verReportes: false,
  verConfiguracion: false,
  crearPrestamos: false,
  crearClientes: true,
  gestionarGarantias: false,
  registrarAbonos: true,
  anularPagos: false,
  exportarExcel: true
};

export const SUPERVISOR_PRESET: UserPermissions = {
  verDashboard: true,
  verCobros: true,
  verPrestamos: true,
  verClientes: true,
  verGarantias: true,
  verPagos: true,
  verCajaBancos: false,
  verReportes: true,
  verConfiguracion: false,
  crearPrestamos: true,
  crearClientes: true,
  gestionarGarantias: true,
  registrarAbonos: true,
  anularPagos: false,
  exportarExcel: true
};

export interface RoleDefinition {
  id: string;
  nombre: string;
  icono: string;
  descripcion: string;
  esSistema: boolean;
  permisos: UserPermissions;
}

export const ROLES_INICIALES: RoleDefinition[] = [
  {
    id: 'Admin',
    nombre: 'Administrador',
    icono: '👑',
    descripcion: 'Control total y financiero de todos los módulos, reportes y parámetros.',
    esSistema: true,
    permisos: ADMIN_PRESET
  },
  {
    id: 'Cobrador',
    nombre: 'Cobrador en Ruta',
    icono: '🛵',
    descripcion: 'Operaciones en campo: Cobros del día, clientes y registro de abonos.',
    esSistema: true,
    permisos: COBRADOR_PRESET
  },
  {
    id: 'Supervisor',
    nombre: 'Supervisor de Cartera',
    icono: '👤',
    descripcion: 'Gestión de créditos, auditoría de clientes y reportes sin acceso a caja.',
    esSistema: false,
    permisos: SUPERVISOR_PRESET
  }
];

@Injectable({
  providedIn: 'root'
})
export class PermissionsService {
  private readonly auth = inject(ApiAuthService);
  private readonly STORAGE_KEY = 'prestaflow_permissions_map';
  private readonly ROLES_KEY = 'prestaflow_custom_roles';

  // Catálogo reactivo de roles del sistema y personalizados
  readonly roles = signal<RoleDefinition[]>(this.loadStoredRoles());

  // Mapa reactivo de permisos guardados por username
  readonly permissionsMap = signal<Record<string, UserPermissions>>(this.loadStoredPermissions());

  // Permisos efectivos del usuario actualmente autenticado
  readonly currentPermissions = computed<UserPermissions>(() => {
    const user = this.auth.currentUser();
    if (!user) return COBRADOR_PRESET;

    const map = this.permissionsMap();
    if (map[user.username]) {
      return map[user.username];
    }

    // Buscar en el catálogo de roles
    const roleDef = this.roles().find(r => r.id === user.rol || r.nombre === user.rol);
    if (roleDef) {
      return { ...roleDef.permisos };
    }

    // Si no tiene configuración personalizada, usar la plantilla según su rol
    return user.rol === 'Admin' ? { ...ADMIN_PRESET } : { ...COBRADOR_PRESET };
  });

  /**
   * Obtiene los permisos configurados para un usuario específico.
   */
  getPermissionsForUser(username: string, role?: string): UserPermissions {
    const map = this.permissionsMap();
    if (map[username]) {
      return { ...map[username] };
    }

    if (role) {
      const roleDef = this.roles().find(r => r.id === role || r.nombre === role);
      if (roleDef) {
        return { ...roleDef.permisos };
      }
    }

    return role === 'Admin' ? { ...ADMIN_PRESET } : { ...COBRADOR_PRESET };
  }

  /**
   * Guarda o actualiza los permisos dinámicos de un usuario en el almacenamiento local.
   */
  savePermissionsForUser(username: string, perms: UserPermissions): void {
    const updated = {
      ...this.permissionsMap(),
      [username]: { ...perms }
    };
    this.permissionsMap.set(updated);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
  }

  /**
   * Crea un nuevo rol personalizado con su juego de permisos.
   */
  crearRol(nombre: string, icono: string, descripcion: string, permisos: UserPermissions): RoleDefinition {
    const id = nombre.trim().replace(/\s+/g, '_');
    const nuevoRol: RoleDefinition = {
      id,
      nombre: nombre.trim(),
      icono: icono || '💼',
      descripcion: descripcion.trim(),
      esSistema: false,
      permisos: { ...permisos }
    };

    const updatedRoles = [...this.roles(), nuevoRol];
    this.roles.set(updatedRoles);
    localStorage.setItem(this.ROLES_KEY, JSON.stringify(updatedRoles));
    return nuevoRol;
  }

  /**
   * Actualiza un rol existente.
   */
  editarRol(id: string, nombre: string, icono: string, descripcion: string, permisos: UserPermissions): void {
    const updated = this.roles().map(r => {
      if (r.id === id) {
        return {
          ...r,
          nombre: nombre.trim(),
          icono: icono || r.icono,
          descripcion: descripcion.trim(),
          permisos: { ...permisos }
        };
      }
      return r;
    });

    this.roles.set(updated);
    localStorage.setItem(this.ROLES_KEY, JSON.stringify(updated));
  }

  /**
   * Elimina un rol personalizado (los roles de sistema como Admin y Cobrador no se pueden borrar).
   */
  eliminarRol(id: string): boolean {
    const rol = this.roles().find(r => r.id === id);
    if (!rol || rol.esSistema) return false;

    const updated = this.roles().filter(r => r.id !== id);
    this.roles.set(updated);
    localStorage.setItem(this.ROLES_KEY, JSON.stringify(updated));
    return true;
  }

  /**
   * Comprueba si el usuario autenticado tiene un permiso operativo específico.
   */
  hasPermission(key: keyof UserPermissions): boolean {
    const current = this.currentPermissions();
    return !!current[key];
  }

  /**
   * Comprueba si el usuario autenticado tiene permiso de acceder a una ruta de la aplicación.
   */
  canAccessRoute(route: string): boolean {
    const p = this.currentPermissions();
    switch (route) {
      case '/': return p.verDashboard;
      case '/cobros': return p.verCobros;
      case '/prestamos': return p.verPrestamos;
      case '/clientes': return p.verClientes;
      case '/garantias': return p.verGarantias;
      case '/pagos': return p.verPagos;
      case '/caja-bancos': return p.verCajaBancos;
      case '/reportes': return p.verReportes;
      case '/configuracion': return p.verConfiguracion;
      default: return true;
    }
  }

  /**
   * Retorna los permisos de una plantilla predefinida.
   */
  getPreset(type: 'admin' | 'cobrador' | 'supervisor'): UserPermissions {
    switch (type) {
      case 'admin': return { ...ADMIN_PRESET };
      case 'cobrador': return { ...COBRADOR_PRESET };
      case 'supervisor': return { ...SUPERVISOR_PRESET };
    }
  }

  private loadStoredRoles(): RoleDefinition[] {
    const stored = localStorage.getItem(this.ROLES_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [...ROLES_INICIALES];
      }
    }
    return [...ROLES_INICIALES];
  }

  private loadStoredPermissions(): Record<string, UserPermissions> {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return {};
      }
    }
    return {};
  }
}
