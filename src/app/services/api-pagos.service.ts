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
  montoPrincipal: number;
  montoInteres: number;
  montoMora: number;
  fechaPago: string;
  metodoPago: 'Efectivo' | 'Transferencia';
  referencia?: string;
  creadoPor: string;
  esAnulado?: boolean;
  motivoAnulacion?: string;
  fechaAnulacion?: string;
}

export interface PagoCreate {
  prestamoId: number;
  monto: number;
  metodoPago: 'Efectivo' | 'Transferencia';
  referencia?: string;
  esAbonoCapital?: boolean;
}

export interface AnularPagoDto {
  motivo: string;
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

  /**
   * Anula un pago registrado previamente, revirtiendo cuotas y caja.
   */
  anularPago(pagoId: number, dto: AnularPagoDto): Observable<PagoResponse> {
    return this.http.post<PagoResponse>(`${environment.apiUrl}/api/pagos/${pagoId}/anular`, dto);
  }
}
