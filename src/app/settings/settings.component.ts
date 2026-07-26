import { Component, inject, signal, computed, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiAuthService } from '../services/api-auth.service';
import { SettingsService } from '../services/settings.service';
import { ApiCajaService } from '../services/api-caja.service';
import { ApiClientsService } from '../services/api-clients.service';
import { ApiPrestamosService } from '../services/api-prestamos.service';
import { ApiPagosService } from '../services/api-pagos.service';
import { ApiUsuariosService } from '../services/api-usuarios.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  protected readonly auth = inject(ApiAuthService);
  private readonly router = inject(Router);
  protected readonly settingsService = inject(SettingsService);
  private readonly apiCajaService = inject(ApiCajaService);
  private readonly apiClientsService = inject(ApiClientsService);
  private readonly apiPrestamosService = inject(ApiPrestamosService);
  private readonly apiPagosService = inject(ApiPagosService);
  private readonly apiUsuariosService = inject(ApiUsuariosService);

  // Sidebar Menu Items
  protected readonly menuItems = [
    { name: 'Dashboard', icon: 'dashboard', active: false, route: '/' },
    { name: 'Préstamos', icon: 'currency_exchange', active: false, route: '/prestamos' },
    { name: 'Clientes', icon: 'people', active: false, route: '/clientes' },
    { name: 'Historial de Pagos', icon: 'receipt_long', active: false, route: '/pagos' },
    { name: 'Caja y Bancos', icon: 'account_balance', active: false, route: '/caja-bancos' },
    { name: 'Reportes', icon: 'analytics', active: false, route: '/reportes' },
    { name: 'Configuración', icon: 'settings', active: true, route: '/configuracion' }
  ];

  // Pestaña activa
  protected readonly activeTab = signal<'general' | 'bancos' | 'usuarios' | 'respaldo'>('general');

  // Formulario: General
  protected readonly editTasa = signal<number>(10);
  protected readonly editMoneda = signal<string>('L.');
  protected readonly editFrecuenciaDiario = signal<boolean>(true);
  protected readonly editFrecuenciaSemanal = signal<boolean>(true);
  protected readonly editFrecuenciaQuincenal = signal<boolean>(true);
  protected readonly editFrecuenciaMensual = signal<boolean>(true);

  // Formulario: Registrar Banco/Caja
  protected readonly newCuentaNombre = signal<string>('');
  protected readonly newCuentaTipo = signal<'Caja' | 'Banco'>('Banco');
  protected readonly newCuentaSaldo = signal<number | null>(null);

  // Formulario: Registrar Usuario/Cobrador
  protected readonly newUsername = signal<string>('');
  protected readonly newPassword = signal<string>('');
  protected readonly newNombre = signal<string>('');
  protected readonly newRol = signal<string>('Cobrador');

  // Formulario: Cambiar Contraseña
  protected readonly showPasswordModal = signal<boolean>(false);
  protected readonly selectedUsername = signal<string>('');
  protected readonly changePasswordValue = signal<string>('');

  // Sidebar User Dropdown Menu
  protected readonly showUserDropdown = signal<boolean>(false);

  // Listados cargados
  protected readonly cuentas = signal<any[]>([]);
  protected readonly usuarios = signal<any[]>([]);

  // Mensajes de Alerta
  protected readonly successMessage = signal<string>('');
  protected readonly errorMessage = signal<string>('');

  ngOnInit(): void {
    this.cargarDatosGenerales();
    this.cargarCuentas();
    this.cargarUsuarios();
  }

  // General tab loading & saving
  private cargarDatosGenerales(): void {
    this.editTasa.set(this.settingsService.tasaInteresBase());
    this.editMoneda.set(this.settingsService.monedaSimbolo());
    
    const frecs = this.settingsService.frecuenciasPermitidas();
    this.editFrecuenciaDiario.set(frecs.includes('Diario'));
    this.editFrecuenciaSemanal.set(frecs.includes('Semanal'));
    this.editFrecuenciaQuincenal.set(frecs.includes('Quincenal'));
    this.editFrecuenciaMensual.set(frecs.includes('Mensual'));
  }

  protected guardarParametros(): void {
    const frecs: string[] = [];
    if (this.editFrecuenciaDiario()) frecs.push('Diario');
    if (this.editFrecuenciaSemanal()) frecs.push('Semanal');
    if (this.editFrecuenciaQuincenal()) frecs.push('Quincenal');
    if (this.editFrecuenciaMensual()) frecs.push('Mensual');

    if (frecs.length === 0) {
      this.showError('Debes habilitar al menos una frecuencia de pago.');
      return;
    }

    this.settingsService.saveSettings(this.editTasa(), this.editMoneda(), frecs);
    this.showSuccess('Parámetros del sistema actualizados con éxito.');
  }

  // Bancos tab loading & registering
  protected cargarCuentas(): void {
    this.apiCajaService.getCuentas().subscribe({
      next: (res) => this.cuentas.set(res),
      error: (err) => console.error('Error al cargar cuentas', err)
    });
  }

  protected registrarCuenta(): void {
    if (!this.newCuentaNombre() || this.newCuentaSaldo() === null || this.newCuentaSaldo()! < 0) {
      this.showError('Por favor completa todos los campos del banco/caja.');
      return;
    }

    const payload = {
      nombre: this.newCuentaNombre(),
      tipo: this.newCuentaTipo(),
      saldo: this.newCuentaSaldo()!
    };

    this.apiCajaService.crearCuenta(payload).subscribe({
      next: () => {
        this.showSuccess(`Cuenta "${payload.nombre}" registrada con éxito.`);
        this.newCuentaNombre.set('');
        this.newCuentaSaldo.set(null);
        this.cargarCuentas();
      },
      error: (err) => {
        this.showError('Error al crear la cuenta financiera.');
        console.error(err);
      }
    });
  }

  // Usuarios tab loading & registering
  protected cargarUsuarios(): void {
    this.apiUsuariosService.getUsuarios().subscribe({
      next: (res) => this.usuarios.set(res),
      error: (err) => console.error('Error al cargar usuarios', err)
    });
  }

  protected registrarUsuario(): void {
    if (!this.newUsername() || !this.newPassword() || !this.newNombre()) {
      this.showError('Por favor completa todos los campos del usuario.');
      return;
    }

    const payload = {
      username: this.newUsername(),
      password: this.newPassword(),
      nombre: this.newNombre(),
      rol: this.newRol()
    };

    this.apiUsuariosService.crearUsuario(payload).subscribe({
      next: () => {
        this.showSuccess(`Usuario "${payload.nombre}" creado con éxito.`);
        this.newUsername.set('');
        this.newPassword.set('');
        this.newNombre.set('');
        this.cargarUsuarios();
      },
      error: (err) => {
        this.showError('Error al registrar el usuario. El nombre de usuario puede estar duplicado.');
        console.error(err);
      }
    });
  }

  // Backup tab download
  protected descargarBackup(): void {
    this.showSuccess('Compilando datos para el respaldo...');
    
    forkJoin({
      clientes: this.apiClientsService.getClientes(),
      prestamos: this.apiPrestamosService.getPrestamos(),
      pagos: this.apiPagosService.getPagos(),
      cuentas: this.apiCajaService.getCuentas()
    }).subscribe({
      next: (data) => {
        const backupObj = {
          sistema: 'PrestaFlow',
          fechaRespaldo: new Date().toISOString(),
          formatoVersion: '1.0',
          tasaInteresBase: this.settingsService.tasaInteresBase(),
          monedaSimbolo: this.settingsService.monedaSimbolo(),
          frecuenciasHabilitadas: this.settingsService.frecuenciasPermitidas(),
          datos: data
        };

        const jsonString = JSON.stringify(backupObj, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `PrestaFlow_Backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        this.showSuccess('Respaldo descargado con éxito. Guárdalo en un USB.');
      },
      error: (err) => {
        this.showError('Error al compilar la copia de seguridad.');
        console.error(err);
      }
    });
  }

  // Alert helpers
  private showSuccess(msg: string): void {
    this.successMessage.set(msg);
    this.errorMessage.set('');
    setTimeout(() => this.successMessage.set(''), 4000);
  }

  private showError(msg: string): void {
    this.errorMessage.set(msg);
    this.successMessage.set('');
    setTimeout(() => this.errorMessage.set(''), 4000);
  }

  protected openChangePasswordModal(username: string): void {
    this.selectedUsername.set(username);
    this.changePasswordValue.set('');
    this.showPasswordModal.set(true);
  }

  protected guardarNuevaContrasena(): void {
    const username = this.selectedUsername();
    const newPassword = this.changePasswordValue();

    if (!newPassword || newPassword.length < 4) {
      this.showError('La contraseña debe tener al menos 4 caracteres.');
      return;
    }

    this.apiUsuariosService.cambiarPassword(username, newPassword).subscribe({
      next: () => {
        this.showSuccess(`Contraseña de "${username}" actualizada con éxito.`);
        this.showPasswordModal.set(false);
      },
      error: (err) => {
        this.showError('Error al actualizar la contraseña.');
        console.error(err);
      }
    });
  }

  protected toggleUserDropdown(event: Event): void {
    event.stopPropagation();
    this.showUserDropdown.update(v => !v);
  }

  @HostListener('document:click')
  protected closeUserDropdown(): void {
    this.showUserDropdown.set(false);
  }

  protected onLogout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
