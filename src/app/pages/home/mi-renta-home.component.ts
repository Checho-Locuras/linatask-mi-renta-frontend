import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MiRentaSessionService } from '../../core/mi-renta-session.service';
import { MiRentaApiService, mrError } from '../../core/mi-renta-api.service';
import { MrCase, STATUS_LABELS } from '../../core/mi-renta.models';

type Mode = 'login' | 'register' | 'forgot';

/**
 * Entrada a Mi renta. Cuenta PROPIA (correo, cédula y contraseña) con verificación de correo. Mejora opcional: un
 * enlace externo (p. ej. desde LinaTask) puede traer `?email=` para precargar el correo; no hay ninguna dependencia de
 * la sesión ni del backend de LinaTask.
 */
@Component({
  selector: 'app-mi-renta-home',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './mi-renta-home.component.html',
})
export class MiRentaHomeComponent implements OnInit {
  readonly session = inject(MiRentaSessionService);
  private readonly api = inject(MiRentaApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  readonly statusLabels = STATUS_LABELS;
  mode = signal<Mode>('login');
  busy = signal(false);
  error = signal<string | null>(null);
  info = signal<string | null>(null);
  cases = signal<MrCase[] | null>(null);
  prefilledEmail: string | null = null;

  loginForm = this.fb.nonNullable.group({ identifier: ['', Validators.required], password: ['', Validators.required] });
  registerForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    documentNumber: ['', [Validators.required, Validators.pattern(/^[\d.\s-]{5,14}$/)]],
    password: ['', [Validators.required, Validators.minLength(10)]],
    accept: [false, Validators.requiredTrue],
  });
  forgotForm = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]] });

  ngOnInit(): void {
    const hinted = this.route.snapshot.queryParamMap.get('email');
    this.prefilledEmail = hinted && /^[^\s@]{1,64}@[^\s@]{1,190}$/.test(hinted) ? hinted.trim().toLowerCase() : null;
    if (this.prefilledEmail) {
      this.loginForm.patchValue({ identifier: this.prefilledEmail });
      this.registerForm.patchValue({ email: this.prefilledEmail });
    }
    if (this.route.snapshot.queryParamMap.get('sesion') === 'expirada') this.info.set('Tu sesión de Mi renta expiró. Inicia sesión de nuevo.');
    if (this.session.isAuthenticated()) this.loadCases();
  }

  hasOwnCase(list: MrCase[]): boolean { return list.some((c) => c.isOwner); }

  setMode(m: Mode): void { this.mode.set(m); this.error.set(null); this.info.set(null); }

  login(): void {
    if (this.loginForm.invalid) { this.loginForm.markAllAsTouched(); return; }
    const { identifier, password } = this.loginForm.getRawValue();
    this.run(this.session.login(identifier.trim(), password), () => { this.loginForm.reset({ identifier, password: '' }); this.loadCases(); });
  }

  register(): void {
    if (this.registerForm.invalid) { this.registerForm.markAllAsTouched(); return; }
    const v = this.registerForm.getRawValue();
    this.run(this.session.register(v.email.trim(), v.documentNumber, v.password, v.accept), (r) => {
      this.info.set(r.message);
      this.registerForm.patchValue({ password: '' });
      this.mode.set('login');
    });
  }

  resend(): void {
    const email = this.registerForm.getRawValue().email || this.loginForm.getRawValue().identifier;
    if (!email.includes('@')) { this.error.set('Escribe tu correo para reenviar el enlace.'); return; }
    this.run(this.session.resendVerification(email.trim()), (r) => this.info.set(r.message));
  }

  forgot(): void {
    if (this.forgotForm.invalid) { this.forgotForm.markAllAsTouched(); return; }
    this.run(this.session.forgotPassword(this.forgotForm.getRawValue().email.trim()), (r) => this.info.set(r.message));
  }

  createCase(): void {
    this.run(this.api.createCase(2025), (c) => this.router.navigate(['/expediente', c.id]));
  }

  logout(): void {
    this.session.logout().subscribe(() => { this.cases.set(null); this.setMode('login'); });
  }

  private loadCases(): void {
    this.api.listCases().subscribe({ next: (c) => this.cases.set(c), error: (e) => this.error.set(mrError(e)) });
  }

  private run<T>(obs: import('rxjs').Observable<T>, ok: (v: T) => void): void {
    this.busy.set(true);
    this.error.set(null);
    obs.subscribe({
      next: (v) => { this.busy.set(false); ok(v); },
      error: (e) => { this.busy.set(false); this.error.set(mrError(e)); },
    });
  }
}
