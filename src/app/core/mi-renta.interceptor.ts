import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { isMiRentaRequest } from './mi-renta.config';
import { MiRentaSessionService } from './mi-renta-session.service';

/**
 * Adjunta el token de Mi renta SOLO a peticiones dirigidas a la API de Mi renta (mismo origen y prefijo que
 * `environment.apiUrl`) y renueva la sesión una vez ante un 401. Ninguna otra petición (CDN, terceros, enlaces
 * firmados) recibe el token.
 */
export const miRentaInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isMiRentaRequest(req.url)) return next(req);
  const session = inject(MiRentaSessionService);
  const router = inject(Router);
  const isAuthCall = /\/auth\/(login|refresh|register|logout|verify-email|forgot-password|reset-password|resend-verification)$/.test(req.url);
  const withToken = (token: string | null) => (token && !isAuthCall ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);

  return next(withToken(session.accessToken)).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || isAuthCall || !session.isAuthenticated()) return throwError(() => err);
      return session.refresh().pipe(
        switchMap((token) => next(withToken(token))),
        catchError(() => {
          router.navigate(['/'], { queryParams: { sesion: 'expirada' } });
          return throwError(() => err);
        }),
      );
    }),
  );
};
