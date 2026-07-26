import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UsuarioResponse {
  username: string;
  nombre: string;
  rol: string;
  activo: boolean;
  fechaCreacion: string;
}

export interface UsuarioCreate {
  username: string;
  password: string;
  nombre: string;
  rol: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiUsuariosService {
  private readonly http = inject(HttpClient);

  getUsuarios(): Observable<UsuarioResponse[]> {
    return this.http.get<UsuarioResponse[]>(`${environment.apiUrl}/api/usuarios`);
  }

  crearUsuario(usuario: UsuarioCreate): Observable<UsuarioResponse> {
    return this.http.post<UsuarioResponse>(`${environment.apiUrl}/api/usuarios`, usuario);
  }

  cambiarPassword(username: string, newPassword: string): Observable<any> {
    return this.http.put<any>(`${environment.apiUrl}/api/usuarios/password`, { username, newPassword });
  }
}
