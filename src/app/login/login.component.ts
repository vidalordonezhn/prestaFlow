import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiAuthService } from '../services/api-auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly authService = inject(ApiAuthService);
  private readonly router = inject(Router);

  // Form Field Signals
  protected readonly username = signal('');
  protected readonly password = signal('');

  // UI State Signals
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  /**
   * Procesa el envío del formulario de inicio de sesión.
   */
  protected onSubmit(): void {
    const user = this.username().trim();
    const pass = this.password().trim();

    if (!user || !pass) {
      this.errorMessage.set('Por favor, ingresa tu usuario y contraseña.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.authService.login({ username: user, password: pass }).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/']); // Redirigir al Dashboard principal
      },
      error: (err) => {
        this.isLoading.set(false);
        const msg = err.error?.mensaje || 'Credenciales incorrectas. Verifica e intenta de nuevo.';
        this.errorMessage.set(msg);
      }
    });
  }
}
