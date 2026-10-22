import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MiRentaSessionService } from '../../core/mi-renta-session.service';
import { MiRentaApiService, mrError } from '../../core/mi-renta-api.service';

/** Lee el token del enlace y lo quita de la barra de direcciones (no queda en el historial). */
function takeToken(route: ActivatedRoute, router: Router): string {
  const token = route.snapshot.queryParamMap.get('token') ?? '';
  router.navigate([], { relativeTo: route, queryParams: {}, replaceUrl: true });
  return token;
}

@Component({
  selector: 'app-mi-renta-verify-email',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="mr-shell"><section class="mr-card" style="max-width:520px;margin-inline:auto">
      <h2>Verificación de correo</h2>
      <p class="mr-muted" *ngIf="state() === 'loading'">Verificando…</p>
      <div class="mr-alert ok" *ngIf="state() === 'ok'" role="status">{{ message() }}</div>
      <div class="mr-alert err" *ngIf="state() === 'error'" role="alert">{{ message() }}</div>
      <a class="mr-btn" routerLink="/">Ir a Mi renta</a>
    </section></div>`,
})
export class MiRentaVerifyEmailComponent implements OnInit {
  private readonly session = inject(MiRentaSessionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  state = signal<'loading' | 'ok' | 'error'>('loading');
  message = signal('');

  ngOnInit(): void {
    const token = takeToken(this.route, this.router);
    if (!token) { this.state.set('error'); this.message.set('El enlace no es válido.'); return; }
    this.session.verifyEmail(token).subscribe({
      next: (r) => { this.state.set('ok'); this.message.set(r.message); },
      error: (e) => { this.state.set('error'); this.message.set(mrError(e)); },
    });
  }
}

@Component({
  selector: 'app-mi-renta-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="mr-shell"><section class="mr-card" style="max-width:520px;margin-inline:auto">
      <h2>Nueva contraseña de Mi renta</h2>
      <div class="mr-alert err" *ngIf="error()" role="alert">{{ error() }}</div>
      <div class="mr-alert ok" *ngIf="done()" role="status">{{ done() }} <a routerLink="/">Iniciar sesión</a></div>
      <form *ngIf="!done()" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="mr-field">
          <label for="mr-rp1">Contraseña nueva (mínimo 10 caracteres, letras y números)</label>
          <input id="mr-rp1" type="password" formControlName="password" autocomplete="new-password" />
        </div>
        <div class="mr-field">
          <label for="mr-rp2">Repite la contraseña</label>
          <input id="mr-rp2" type="password" formControlName="confirm" autocomplete="new-password" />
        </div>
        <button class="mr-btn" type="submit" [disabled]="busy()">Guardar</button>
      </form>
    </section></div>`,
})
export class MiRentaResetPasswordComponent implements OnInit {
  private readonly session = inject(MiRentaSessionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private token = '';
  form = inject(FormBuilder).nonNullable.group({ password: ['', [Validators.required, Validators.minLength(10)]], confirm: ['', Validators.required] });
  busy = signal(false);
  error = signal<string | null>(null);
  done = signal<string | null>(null);

  ngOnInit(): void { this.token = takeToken(this.route, this.router); if (!this.token) this.error.set('El enlace no es válido.'); }

  submit(): void {
    const { password, confirm } = this.form.getRawValue();
    if (this.form.invalid) { this.error.set('La contraseña debe tener al menos 10 caracteres.'); return; }
    if (password !== confirm) { this.error.set('Las contraseñas no coinciden.'); return; }
    this.busy.set(true);
    this.session.resetPassword(this.token, password).subscribe({
      next: (r) => { this.busy.set(false); this.done.set(r.message); this.session.clear(); },
      error: (e) => { this.busy.set(false); this.error.set(mrError(e)); },
    });
  }
}

@Component({
  selector: 'app-mi-renta-unsubscribe',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="mr-shell"><section class="mr-card" style="max-width:520px;margin-inline:auto">
      <h2>Recordatorios por correo</h2>
      <div class="mr-alert" [class.ok]="ok()" [class.err]="!ok()" role="status">{{ message() || 'Procesando…' }}</div>
      <a class="mr-btn secondary" routerLink="/">Ir a Mi renta</a>
    </section></div>`,
})
export class MiRentaUnsubscribeComponent implements OnInit {
  private readonly api = inject(MiRentaApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  ok = signal(false);
  message = signal('');

  ngOnInit(): void {
    const token = takeToken(this.route, this.router);
    this.api.unsubscribe(token).subscribe({
      next: (r) => { this.ok.set(true); this.message.set(r.message); },
      error: (e) => this.message.set(mrError(e)),
    });
  }
}
