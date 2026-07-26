import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ClienteLoanHistory {
  loanId: string;
  amount: number;
  interest: number;
  date: string;
  status: 'Activo' | 'Pagado' | 'Mora';
  cuotas: string;
}

export interface ClienteResponse {
  id: number;
  identidad: string;
  nombre: string;
  phone: string;
  address: string;
  zone: string;
  refName: string;
  refPhone: string;
  loansCount: number;
  balance: number;
  status: 'Al Día' | 'En Mora' | 'Sin Crédito';
  score: 'Excelente' | 'Regular' | 'Mora' | 'Nuevo';
  prestamosHistory: ClienteLoanHistory[];
}

export interface ClienteCreate {
  identidad: string;
  nombre: string;
  phone: string;
  address: string;
  zone: string;
  refName: string;
  refPhone: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiClientsService {
  private readonly http = inject(HttpClient);

  /**
   * Obtiene la lista completa de clientes desde la API de .NET.
   */
  getClientes(): Observable<ClienteResponse[]> {
    return this.http.get<ClienteResponse[]>(`${environment.apiUrl}/api/clientes`);
  }

  /**
   * Obtiene la ficha crediticia detallada de un cliente por su ID.
   */
  getCliente(id: number): Observable<ClienteResponse> {
    return this.http.get<ClienteResponse>(`${environment.apiUrl}/api/clientes/${id}`);
  }

  /**
   * Registra un nuevo cliente en el backend.
   */
  createCliente(cliente: ClienteCreate): Observable<ClienteResponse> {
    return this.http.post<ClienteResponse>(`${environment.apiUrl}/api/clientes`, cliente);
  }
}
