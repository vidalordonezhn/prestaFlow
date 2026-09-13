import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Garantia {
  id: number;
  codigo: string;
  clienteId: number;
  clienteNombre: string;
  clienteIdentidad: string;
  clientePhone: string;
  prestamoId?: number | null;
  prestamoCodigo?: string | null;
  prestamoSaldoRestante?: number | null;
  tipo: string;
  descripcion: string;
  numeroSerie?: string | null;
  valorEstimado: number;
  estadoCustodia: 'En Custodia' | 'Devuelta' | 'En Remate' | 'Liquidada';
  ubicacionFisica: string;
  fotoUrl?: string | null;
  observaciones?: string | null;
  fechaIngreso: string;
  fechaDevolucion?: string | null;
  fechaCreacion: string;
  creadoPor: string;
}

export interface CrearGarantiaRequest {
  clienteId: number;
  prestamoId?: number | null;
  tipo: string;
  descripcion: string;
  numeroSerie?: string | null;
  valorEstimado: number;
  ubicacionFisica: string;
  fotoUrl?: string | null;
  observaciones?: string | null;
}

export interface ActualizarGarantiaRequest {
  prestamoId?: number | null;
  tipo: string;
  descripcion: string;
  numeroSerie?: string | null;
  valorEstimado: number;
  ubicacionFisica: string;
  fotoUrl?: string | null;
  observaciones?: string | null;
}

export interface CambiarEstadoGarantiaRequest {
  estadoCustodia: 'En Custodia' | 'Devuelta' | 'En Remate' | 'Liquidada';
  observaciones?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class ApiGarantiasService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/garantias`;

  getGarantias(query?: string, estado?: string, tipo?: string): Observable<Garantia[]> {
    let params = new HttpParams();
    if (query) params = params.set('query', query);
    if (estado && estado !== 'Todos') params = params.set('estado', estado);
    if (tipo && tipo !== 'Todos') params = params.set('tipo', tipo);
    return this.http.get<Garantia[]>(this.baseUrl, { params });
  }

  getGarantiaById(id: number): Observable<Garantia> {
    return this.http.get<Garantia>(`${this.baseUrl}/${id}`);
  }

  getGarantiasByCliente(clienteId: number): Observable<Garantia[]> {
    return this.http.get<Garantia[]>(`${this.baseUrl}/cliente/${clienteId}`);
  }

  crearGarantia(data: CrearGarantiaRequest): Observable<Garantia> {
    return this.http.post<Garantia>(this.baseUrl, data);
  }

  actualizarGarantia(id: number, data: ActualizarGarantiaRequest): Observable<Garantia> {
    return this.http.put<Garantia>(`${this.baseUrl}/${id}`, data);
  }

  cambiarEstado(id: number, data: CambiarEstadoGarantiaRequest): Observable<Garantia> {
    return this.http.patch<Garantia>(`${this.baseUrl}/${id}/estado`, data);
  }

  eliminarGarantia(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
