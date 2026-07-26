import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CuentaResponse {
  id: number;
  nombre: string;
  tipo: 'Caja' | 'Banco';
  saldo: number;
}

export interface TransaccionResponse {
  id: number;
  cuentaId: number;
  cuentaNombre: string;
  tipo: 'Ingreso' | 'Egreso' | 'Transferencia';
  monto: number;
  concepto: string;
  fecha: string;
  creadoPor: string;
}

export interface TransaccionCreate {
  cuentaId: number;
  tipo: 'Ingreso' | 'Egreso';
  monto: number;
  concepto: string;
}

export interface TransferenciaCreate {
  cuentaOrigenId: number;
  cuentaDestinoId: number;
  monto: number;
  concepto: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiCajaService {
  private readonly http = inject(HttpClient);

  /**
   * Crea una nueva cuenta financiera.
   */
  crearCuenta(cuenta: { nombre: string; tipo: 'Caja' | 'Banco'; saldo: number }): Observable<CuentaResponse> {
    return this.http.post<CuentaResponse>(`${environment.apiUrl}/api/cajabancos/cuenta`, cuenta);
  }

  /**
   * Obtiene la lista de cuentas (Cajas y Bancos).
   */
  getCuentas(): Observable<CuentaResponse[]> {
    return this.http.get<CuentaResponse[]>(`${environment.apiUrl}/api/cajabancos/cuentas`);
  }

  /**
   * Obtiene la lista histórica de todas las transacciones.
   */
  getTransacciones(): Observable<TransaccionResponse[]> {
    return this.http.get<TransaccionResponse[]>(`${environment.apiUrl}/api/cajabancos/transacciones`);
  }

  /**
   * Registra un ingreso o egreso manual en una cuenta.
   */
  crearTransaccion(transaccion: TransaccionCreate): Observable<TransaccionResponse> {
    return this.http.post<TransaccionResponse>(`${environment.apiUrl}/api/cajabancos/transaccion`, transaccion);
  }

  /**
   * Registra un traspaso de fondos entre dos cuentas.
   */
  crearTransferencia(transferencia: TransferenciaCreate): Observable<TransaccionResponse[]> {
    return this.http.post<TransaccionResponse[]>(`${environment.apiUrl}/api/cajabancos/transferencia`, transferencia);
  }
}
