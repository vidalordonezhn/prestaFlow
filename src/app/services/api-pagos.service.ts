import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PagoResponse {
  id: number;
  prestamoId: number;
  prestamoCodigo: string;
  clienteNombre: string;
  clienteIdentidad: string;
  clientePhone: string;
  monto: number;
  fechaPago: string;
  metodoPago: 'Efectivo' | 'Transferencia';
  referencia?: string;
  creadoPor: string;
}

export interface PagoCreate {
  prestamoId: number;
  monto: number;
  metodoPago: 'Efectivo' | 'Transferencia';
  referencia?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiPagosService {
  private readonly http = inject(HttpClient);

  /**
   * Obtiene la lista de todos los pagos registrados.
   */
  getPagos(): Observable<PagoResponse[]> {
    return this.http.get<PagoResponse[]>(`${environment.apiUrl}/api/pagos`);
  }

  /**
   * Registra un abono/pago de cuota.
   */
  createPago(pago: PagoCreate): Observable<PagoResponse> {
    return this.http.post<PagoResponse>(`${environment.apiUrl}/api/pagos`, pago);
  }
}
