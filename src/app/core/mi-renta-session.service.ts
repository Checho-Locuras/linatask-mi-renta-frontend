import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, finalize, map, of, shareReplay, tap, catchError, throwError } from 'rxjs';
import { MI_RENTA_API } from './mi-renta.config';
import { MrMe, MrMessage, MrTokens } from './mi-renta.models';

const KEY = 'mirenta.session';

/**
 * Sesión propia de Mi renta. Se guarda en sessionStorage (por pestaña): se borra al cerrar la pestaña, no viaja en
 * cookies y solo la usa el interceptor para la API de Mi renta. El refresh token rota en cada renovación.
 */
@Injectable({ providedIn: 'root' })
export class MiRentaSessionService {
  private readonly state = signal<MrTokens | null>(this.read());
  readonly user = computed<MrMe | null>(() => this.state()?.user ?? null);
  readonly isAuthenticated = computed(() => !!this.state());
  private refreshing$: Observable<string> | null = null;

  constructor(private http: HttpClient) {}

  get accessToken(): string | null { return this.state()?.accessToken ?? null; }
  get configured(): boolean { return !!MI_RENTA_API; }

  private ctx() { return {}; }

  register(email: string, documentNumber: string, password: string, acceptPrivacyNotice: boolean): Observable<MrMessage> {
    return this.http.post<MrMessage>(`${MI_RENTA_API}/auth/register`, { email, documentNumber, password, acceptPrivacyNotice }, this.ctx());
  }
  resendVerification(email: string): Observable<MrMessage> { return this.http.post<MrMessage>(`${MI_RENTA_API}/auth/resend-verification`, { email }, this.ctx()); }
  verifyEmail(token: string): Observable<MrMessage> { return this.http.post<MrMessage>(`${MI_RENTA_API}/auth/verify-email`, { token }, this.ctx()); }
  forgotPassword(email: string): Observable<MrMessage> { return this.http.post<MrMessage>(`${MI_RENTA_API}/auth/forgot-password`, { email }, this.ctx()); }
  resetPassword(token: string, newPassword: string): Observable<MrMessage> {
    return this.http.post<MrMessage>(`${MI_RENTA_API}/auth/reset-password`, { token, newPassword }, this.ctx());
  }

  login(identifier: string, password: string): Observable<MrMe> {
    return this.http.post<MrTokens>(`${MI_RENTA_API}/auth/login`, { identifier, password }, this.ctx()).pipe(
      tap((t) => this.save(t)), map((t) => t.user));
  }

  /** Renueva el token de acceso (una sola petición concurrente). */
  refresh(): Observable<string> {
    const current = this.state();
    if (!current) return throwError(() => new Error('sin sesión'));
    if (!this.refreshing$) {
      this.refreshing$ = this.http.post<MrTokens>(`${MI_RENTA_API}/auth/refresh`, { refreshToken: current.refreshToken }, this.ctx()).pipe(
        tap((t) => this.save(t)),
        map((t) => t.accessToken),
        catchError((e) => { this.clear(); return throwError(() => e); }),
        finalize(() => (this.refreshing$ = null)),
        shareReplay(1),
      );
    }
    return this.refreshing$;
  }

  logout(): Observable<void> {
    const current = this.state();
    this.clear();
    if (!current) return of(void 0);
    return this.http.post<void>(`${MI_RENTA_API}/auth/logout`, { refreshToken: current.refreshToken }, this.ctx()).pipe(catchError(() => of(void 0)));
  }

  updateUser(patch: Partial<MrMe>): void {
    const s = this.state();
    if (s) this.save({ ...s, user: { ...s.user, ...patch } });
  }

  clear(): void {
    this.state.set(null);
    try { sessionStorage.removeItem(KEY); } catch { /* almacenamiento no disponible */ }
  }

  private save(t: MrTokens): void {
    this.state.set(t);
    try { sessionStorage.setItem(KEY, JSON.stringify(t)); } catch { /* almacenamiento no disponible */ }
  }

  private read(): MrTokens | null {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as MrTokens) : null;
    } catch {
      return null;
    }
  }
}
