import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  expiracionMinutos: number;
  username: string;
  nombre: string;
  rol: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiAuthService {
  private readonly http = inject(HttpClient);
  
  // Señal reactiva del usuario actualmente autenticado
  readonly currentUser = signal<Omit<LoginResponse, 'token'> | null>(null);

  constructor() {
    this.cargarSesion();
  }

  /**
   * Envía credenciales al backend para autenticación.
   */
  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/api/auth/login`, credentials).pipe(
      tap(res => {
        localStorage.setItem('prestaflow_token', res.token);
        localStorage.setItem('prestaflow_user', JSON.stringify({
          username: res.username,
          nombre: res.nombre,
          rol: res.rol,
          expiracionMinutos: res.expiracionMinutos
        }));
        
        this.currentUser.set({
          username: res.username,
          nombre: res.nombre,
          rol: res.rol,
          expiracionMinutos: res.expiracionMinutos
        });
      })
    );
  }

  /**
   * Cierra sesión y remueve datos del almacenamiento local.
   */
  logout(): void {
    localStorage.removeItem('prestaflow_token');
    localStorage.removeItem('prestaflow_user');
    this.currentUser.set(null);
  }

  /**
   * Carga los datos de sesión desde el localStorage al inicializar la app.
   */
  private cargarSesion(): void {
    const userJson = localStorage.getItem('prestaflow_user');
    const token = localStorage.getItem('prestaflow_token');
    
    if (userJson && token) {
      try {
        this.currentUser.set(JSON.parse(userJson));
      } catch {
        this.logout();
      }
    }
  }
}
