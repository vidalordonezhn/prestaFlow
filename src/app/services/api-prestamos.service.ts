import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CuotaResponse {
  id: number;
  numeroCuota: number;
  fechaVencimiento: string;
  montoPrincipal: number;
  montoInteres: number;
  montoMoratorio: number;
  montoPagadoPrincipal: number;
  montoPagadoInteres: number;
  montoPagadoMora: number;
  estado: 'Pendiente' | 'Parcial' | 'Pagado' | 'Vencido';
  fechaUltimoCalculoMora?: string;
}

export interface PrestamoResponse {
  id: number;
  codigo: string;
  clienteId: number;
  clienteNombre: string;
  clientePhone: string;
  capital: number;
  interesPorcentaje: number;
  plazoCuotas: number;
  cuotaMonto: number;
  cuotasPagadas: number;
  status: 'Activo' | 'Pagado' | 'Mora';
  frecuencia: 'Diario' | 'Semanal' | 'Mensual';
  tipoPrestamo: string;
  metodoDesembolso: string;
  tipoInteres: 'Fijo' | 'Variable';
  tasaMoraPorcentaje: number;
  fechaOtorgado: string;
  cuotas: CuotaResponse[];
}

export interface PrestamoCreate {
  clienteId: number;
  capital: number;
  interesPorcentaje: number;
  plazoCuotas: number;
  frecuencia: 'Diario' | 'Semanal' | 'Mensual';
  cuentaDesembolsoId: number;
  tipoPrestamo: string;
  metodoDesembolso: string;
  tipoInteres: 'Fijo' | 'Variable';
  tasaMoraPorcentaje: number;
}

@Injectable({
  providedIn: 'root'
})
export class ApiPrestamosService {
  private readonly http = inject(HttpClient);

  /**
   * Obtiene la lista de todos los préstamos registrados.
   */
  getPrestamos(): Observable<PrestamoResponse[]> {
    return this.http.get<PrestamoResponse[]>(`${environment.apiUrl}/api/prestamos`);
  }

  /**
   * Registra un nuevo préstamo y realiza el descuento contable.
   */
  createPrestamo(prestamo: PrestamoCreate): Observable<PrestamoResponse> {
    return this.http.post<PrestamoResponse>(`${environment.apiUrl}/api/prestamos`, prestamo);
  }
}
