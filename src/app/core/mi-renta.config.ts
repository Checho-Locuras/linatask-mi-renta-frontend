import { environment } from '../../environments/environment';

/** URL base del microservicio Mi renta. Vacía = servicio aún no desplegado en este entorno. */
export const MI_RENTA_API: string = (environment.apiUrl ?? '').replace(/\/+$/, '');

export function isMiRentaRequest(url: string): boolean {
  if (!MI_RENTA_API) return false;
  try {
    const base = typeof location !== 'undefined' ? location.href : 'http://localhost/';
    const target = new URL(url, base);
    const api = new URL(MI_RENTA_API, base);
    return target.origin === api.origin && (target.pathname === api.pathname || target.pathname.startsWith(api.pathname + '/'));
  } catch {
    return false;
  }
}
