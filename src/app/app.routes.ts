import { Routes } from '@angular/router';
import { miRentaAuthGuard } from './core/mi-renta.guard';

/** Rutas de Mi renta (carga diferida). Los enlaces de los correos del backend apuntan a estas rutas. */
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/mi-renta-home.component').then((m) => m.MiRentaHomeComponent), title: 'Mi renta' },
  { path: 'verificar-correo', loadComponent: () => import('./pages/token/mi-renta-token-pages.component').then((m) => m.MiRentaVerifyEmailComponent), title: 'Mi renta · Verificar correo' },
  { path: 'restablecer', loadComponent: () => import('./pages/token/mi-renta-token-pages.component').then((m) => m.MiRentaResetPasswordComponent), title: 'Mi renta · Nueva contraseña' },
  { path: 'recordatorios/baja', loadComponent: () => import('./pages/token/mi-renta-token-pages.component').then((m) => m.MiRentaUnsubscribeComponent), title: 'Mi renta · Recordatorios' },
  { path: 'consulta-dian', loadComponent: () => import('./pages/dian/mi-renta-dian.component').then((m) => m.MiRentaDianComponent), title: 'Mi renta · ¿Debo declarar?' },
  {
    path: 'expediente/:id', canActivate: [miRentaAuthGuard],
    loadComponent: () => import('./pages/case/mi-renta-case.component').then((m) => m.MiRentaCaseComponent), title: 'Mi renta · Expediente',
  },
  { path: '**', redirectTo: '' },
];
