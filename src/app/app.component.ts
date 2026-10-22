import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <a class="mr-skip" href="#contenido">Saltar al contenido</a>
    <header class="mr-appbar">
      <a routerLink="/" class="mr-appbar-brand" aria-label="Mi renta, inicio">Mi renta</a>
      <span class="mr-appbar-tag">Borrador de renta 2025 · formulario 210</span>
    </header>
    <main id="contenido"><router-outlet /></main>
    <footer class="mr-footer">
      Mi renta prepara un borrador para revisión profesional. No presenta declaraciones ni pide tu contraseña de la DIAN.
    </footer>
  `,
})
export class AppComponent {}
