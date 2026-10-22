import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MiRentaSessionService } from './mi-renta-session.service';

export const miRentaAuthGuard: CanActivateFn = () => {
  const session = inject(MiRentaSessionService);
  return session.isAuthenticated() ? true : inject(Router).createUrlTree(['/']);
};
