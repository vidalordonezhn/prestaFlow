import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiAuthService } from '../services/api-auth.service';
import { PermissionsService, UserPermissions } from '../services/permissions.service';

/**
 * Guarda para proteger rutas operativas del sistema (Dashboard, Clientes, Préstamos).
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(ApiAuthService);
  const router = inject(Router);

  if (authService.currentUser()) {
    return true;
  }

  // Redirigir a login si no hay sesión activa
  router.navigate(['/login']);
  return false;
};

/**
 * Guarda para prevenir que usuarios ya autenticados accedan a la vista de Login.
 */
export const loginGuard: CanActivateFn = (route, state) => {
  const authService = inject(ApiAuthService);
  const router = inject(Router);

  if (authService.currentUser()) {
    router.navigate(['/']);
    return false;
  }

  return true;
};

/**
 * Guarda dinámica que verifica si el usuario tiene permiso para acceder a una ruta o función.
 */
export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(ApiAuthService);
  const permissionsService = inject(PermissionsService);
  const router = inject(Router);
  const user = authService.currentUser();

  if (!user) {
    router.navigate(['/login']);
    return false;
  }

  if (user.rol === 'Admin' || permissionsService.canAccessRoute(state.url)) {
    return true;
  }

  // Si no tiene permiso, redirigir a Cobros de Hoy
  router.navigate(['/cobros']);
  return false;
};
