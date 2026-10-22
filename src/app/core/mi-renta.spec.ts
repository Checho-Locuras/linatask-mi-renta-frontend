import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { MI_RENTA_API, isMiRentaRequest } from './mi-renta.config';
import { miRentaInterceptor } from './mi-renta.interceptor';
import { MiRentaSessionService } from './mi-renta-session.service';
import { miRentaAuthGuard } from './mi-renta.guard';
import { MrTokens } from './mi-renta.models';

const tokens = (access: string, refresh = 'r-' + access): MrTokens => ({
  accessToken: access, accessTokenExpiresAt: '2099-01-01T00:00:00Z', refreshToken: refresh, refreshTokenExpiresAt: '2099-01-01T00:00:00Z',
  user: { id: 'u1', email: 'persona@example.test', maskedDocument: '•••••123', role: 'Taxpayer', remindersOptOut: false },
});

describe('Mi renta · sesión e interceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let session: MiRentaSessionService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([miRentaInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    session = TestBed.inject(MiRentaSessionService);
  });

  afterEach(() => { backend.verify(); sessionStorage.clear(); });

  it('reconoce solo las URLs de la API de Mi renta', () => {
    expect(MI_RENTA_API).toBe('http://localhost:5080/api/v1/my-rent');
    expect(isMiRentaRequest(`${MI_RENTA_API}/cases`)).toBeTrue();
    expect(isMiRentaRequest(`${MI_RENTA_API}-evil/cases`)).toBeFalse();
    expect(isMiRentaRequest('http://localhost:5080/otra-api')).toBeFalse();
    expect(isMiRentaRequest('https://cdn.example.test/x.js')).toBeFalse();
  });

  it('adjunta el token solo a la API de Mi renta', () => {
    session.login('persona@example.test', 'x').subscribe();
    backend.expectOne(`${MI_RENTA_API}/auth/login`).flush(tokens('jwt-mirenta'));

    http.get(`${MI_RENTA_API}/cases`).subscribe();
    const own = backend.expectOne(`${MI_RENTA_API}/cases`);
    expect(own.request.headers.get('Authorization')).toBe('Bearer jwt-mirenta');
    own.flush([]);

    http.get('https://terceros.example.test/recurso').subscribe();
    const other = backend.expectOne('https://terceros.example.test/recurso');
    expect(other.request.headers.has('Authorization')).toBeFalse();
    other.flush({});
  });

  it('no adjunta token a las llamadas de autenticación', () => {
    session.login('persona@example.test', 'x').subscribe();
    const req = backend.expectOne(`${MI_RENTA_API}/auth/login`);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush(tokens('a'));
  });

  it('renueva la sesión una vez ante 401 y reintenta con el token nuevo', () => {
    session.login('p@example.test', 'x').subscribe();
    backend.expectOne(`${MI_RENTA_API}/auth/login`).flush(tokens('viejo'));
    let result: unknown;
    http.get(`${MI_RENTA_API}/cases`).subscribe((r) => (result = r));
    backend.expectOne(`${MI_RENTA_API}/cases`).flush({}, { status: 401, statusText: 'Unauthorized' });
    const refresh = backend.expectOne(`${MI_RENTA_API}/auth/refresh`);
    expect(refresh.request.body).toEqual({ refreshToken: 'r-viejo' });
    refresh.flush(tokens('nuevo'));
    const retry = backend.expectOne(`${MI_RENTA_API}/cases`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer nuevo');
    retry.flush(['ok']);
    expect(result).toEqual(['ok']);
  });

  it('si la renovación falla, cierra la sesión y vuelve al inicio', () => {
    const nav = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    session.login('p@example.test', 'x').subscribe();
    backend.expectOne(`${MI_RENTA_API}/auth/login`).flush(tokens('viejo'));
    http.get(`${MI_RENTA_API}/cases`).subscribe({ error: () => {} });
    backend.expectOne(`${MI_RENTA_API}/cases`).flush({}, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne(`${MI_RENTA_API}/auth/refresh`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(session.isAuthenticated()).toBeFalse();
    expect(sessionStorage.getItem('mirenta.session')).toBeNull();
    expect(nav).toHaveBeenCalledWith(['/'], { queryParams: { sesion: 'expirada' } });
  });

  it('el guard exige una sesión de Mi renta', () => {
    const run = () => TestBed.runInInjectionContext(() => miRentaAuthGuard({} as never, {} as never));
    expect(run()).not.toBeTrue();
    session.login('p@example.test', 'x').subscribe();
    backend.expectOne(`${MI_RENTA_API}/auth/login`).flush(tokens('a'));
    expect(run()).toBeTrue();
  });

  it('logout revoca el refresh token y limpia el almacenamiento', () => {
    session.login('p@example.test', 'x').subscribe();
    backend.expectOne(`${MI_RENTA_API}/auth/login`).flush(tokens('a', 'r1'));
    session.logout().subscribe();
    const req = backend.expectOne(`${MI_RENTA_API}/auth/logout`);
    expect(req.request.body).toEqual({ refreshToken: 'r1' });
    req.flush(null);
    expect(session.isAuthenticated()).toBeFalse();
  });

  it('una sesión guardada sobrevive a recargar la página (nueva instancia del servicio)', () => {
    session.login('p@example.test', 'x').subscribe();
    backend.expectOne(`${MI_RENTA_API}/auth/login`).flush(tokens('persistente'));
    const fresh = TestBed.runInInjectionContext(() => new MiRentaSessionService(TestBed.inject(HttpClient)));
    expect(fresh.accessToken).toBe('persistente');
  });
});
