import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MiRentaHomeComponent } from './mi-renta-home.component';
import { MI_RENTA_API } from '../../core/mi-renta.config';

function setup(query: Record<string, string>): ComponentFixture<MiRentaHomeComponent> {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    imports: [MiRentaHomeComponent],
    providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  const f = TestBed.createComponent(MiRentaHomeComponent);
  f.detectChanges();
  return f;
}

describe('MiRentaHomeComponent', () => {
  afterEach(() => sessionStorage.clear());

  it('funciona sin sesión de ningún otro sistema y muestra el acceso propio', () => {
    const f = setup({});
    const text = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Iniciar sesión');
    expect(text).toContain('Crear cuenta');
    expect(text).not.toContain('no está disponible');
  });

  it('precarga un correo válido recibido por enlace, sin depender de otra sesión', () => {
    const f = setup({ email: 'Persona@Example.test' });
    expect(f.componentInstance.loginForm.getRawValue().identifier).toBe('persona@example.test');
    expect(f.componentInstance.registerForm.getRawValue().email).toBe('persona@example.test');
  });

  it('ignora un parámetro de correo inválido', () => {
    const f = setup({ email: '<script>' });
    expect(f.componentInstance.loginForm.getRawValue().identifier).toBe('');
  });

  it('muestra el aviso de sesión expirada', () => {
    const f = setup({ sesion: 'expirada' });
    expect((f.nativeElement as HTMLElement).textContent).toContain('Tu sesión de Mi renta expiró');
  });

  it('no envía el registro si falta aceptar el aviso de privacidad', () => {
    const f = setup({});
    const http = TestBed.inject(HttpTestingController);
    f.componentInstance.registerForm.setValue({ email: 'a@example.test', documentNumber: '1234567', password: 'Clave-2025-larga', accept: false });
    f.componentInstance.register();
    http.expectNone(`${MI_RENTA_API}/auth/register`);
    http.verify();
  });
});
