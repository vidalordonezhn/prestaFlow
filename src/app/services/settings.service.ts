import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  readonly tasaInteresBase = signal<number>(10.0);
  readonly monedaSimbolo = signal<string>('L.');
  readonly frecuenciasPermitidas = signal<string[]>(['Diario', 'Semanal', 'Quincenal', 'Mensual']);

  constructor() {
    this.loadSettings();
  }

  saveSettings(tasa: number, moneda: string, frecuencias: string[]): void {
    this.tasaInteresBase.set(tasa);
    this.monedaSimbolo.set(moneda);
    this.frecuenciasPermitidas.set(frecuencias);

    localStorage.setItem('prestaflow_tasa_base', tasa.toString());
    localStorage.setItem('prestaflow_moneda', moneda);
    localStorage.setItem('prestaflow_frecuencias', JSON.stringify(frecuencias));
  }

  private loadSettings(): void {
    const tasa = localStorage.getItem('prestaflow_tasa_base');
    const moneda = localStorage.getItem('prestaflow_moneda');
    const frecuencias = localStorage.getItem('prestaflow_frecuencias');

    if (tasa) this.tasaInteresBase.set(parseFloat(tasa));
    if (moneda) this.monedaSimbolo.set(moneda);
    if (frecuencias) {
      try {
        this.frecuenciasPermitidas.set(JSON.parse(frecuencias));
      } catch {
        // Fallback
      }
    }
  }
}
