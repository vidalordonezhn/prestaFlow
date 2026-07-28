import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ResumenCartera {
  capitalColocado: number;
  interesPendiente: number;
  totalProyectado: number;
  clientesMoraActiva: number;
  capitalHistoricoPrestado: number;
  capitalActual: number;
}

export interface IngresosReporte {
  total: number;
  capital: number;
  interes: number;
  mora: number;
}

export interface MoraDeudor {
  clienteNombre: string;
  clienteIdentidad: string;
  prestamoCodigo: string;
  diasRetraso: number;
  cuotasVencidas: number;
  montoAtrasado: number;
  nivelRiesgo: 'Bajo' | 'Medio' | 'Alto';
}

@Injectable({
  providedIn: 'root'
})
export class ApiReportesService {
  private readonly http = inject(HttpClient);

  getCartera(): Observable<ResumenCartera> {
    return this.http.get<ResumenCartera>(`${environment.apiUrl}/api/reportes/cartera`);
  }

  getIngresos(startDate?: string, endDate?: string): Observable<IngresosReporte> {
    let params: any = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return this.http.get<IngresosReporte>(`${environment.apiUrl}/api/reportes/ingresos`, { params });
  }

  getDeudoresMora(): Observable<MoraDeudor[]> {
    return this.http.get<MoraDeudor[]>(`${environment.apiUrl}/api/reportes/mora`);
  }
}
