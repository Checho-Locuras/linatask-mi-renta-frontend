import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MiRentaApiService, mrError } from '../../core/mi-renta-api.service';
import { MrDianStatus } from '../../core/mi-renta.models';

/**
 * Pre-consulta "¿debo declarar?" (pública). Por defecto el servicio la tiene desactivada y solo se ofrece el enlace a
 * la consulta oficial de la DIAN. Los indicadores que devuelva la DIAN se muestran SIN interpretar.
 */
@Component({
  selector: 'app-mi-renta-dian',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, KeyValuePipe],
  template: `
    <div class="mr-shell"><section class="mr-card" style="max-width:640px;margin-inline:auto">
      <h2>¿Debo declarar renta? — consulta orientativa</h2>
      <p class="mr-muted">
        La única fuente oficial es la DIAN. Mi renta no guarda tu documento, el reCAPTCHA ni el resultado de esta consulta.
      </p>
      <div class="mr-alert err" *ngIf="error()" role="alert">{{ error() }}</div>
      <ng-container *ngIf="status() as s">
        <div class="mr-alert" *ngIf="!s.enabled">
          La consulta automática está desactivada. Consulta tu situación directamente en la DIAN:
          <a [href]="s.officialConsultUrl" target="_blank" rel="noopener noreferrer">{{ s.officialConsultUrl }}</a>
        </div>
        <form *ngIf="s.enabled" (ngSubmit)="check()">
          <div class="mr-field"><label for="mr-dd">Número de cédula</label><input id="mr-dd" name="doc" [(ngModel)]="doc" inputmode="numeric" autocomplete="off" /></div>
          <div class="mr-field"><label for="mr-dc">Código reCAPTCHA de la DIAN (lo resuelves tú)</label><input id="mr-dc" name="cap" [(ngModel)]="captcha" autocomplete="off" /></div>
          <button class="mr-btn" type="submit" [disabled]="busy()">Consultar</button>
        </form>
        <div *ngIf="result() as r" class="mr-card">
          <p class="mr-muted">{{ s.notice }}</p>
          <table class="mr-table"><tbody>
            <tr><th>Año gravable</th><td>{{ r.anoGravable ?? '—' }}</td></tr>
            <tr *ngFor="let kv of r.rawIndicators | keyvalue"><th>{{ kv.key }}</th><td>{{ kv.value ?? '—' }} <span class="mr-muted">(sin interpretar)</span></td></tr>
          </tbody></table>
          <a [href]="s.officialConsultUrl" target="_blank" rel="noopener noreferrer">Verificar en la DIAN</a>
        </div>
      </ng-container>
      <div class="mr-actions"><a class="mr-btn secondary" routerLink="/">Volver a Mi renta</a></div>
    </section></div>`,
})
export class MiRentaDianComponent implements OnInit {
  private readonly api = inject(MiRentaApiService);
  status = signal<MrDianStatus | null>(null);
  result = signal<{ anoGravable: string | null; rawIndicators: Record<string, string | null> } | null>(null);
  error = signal<string | null>(null);
  busy = signal(false);
  doc = '';
  captcha = '';

  ngOnInit(): void { this.api.dianStatus().subscribe({ next: (s) => this.status.set(s), error: (e) => this.error.set(mrError(e)) }); }

  check(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.dianDeclarant(this.doc.trim(), '13', this.captcha.trim()).subscribe({
      next: (r) => { this.busy.set(false); this.captcha = ''; if (r.ok && r.value) this.result.set(r.value); else this.error.set(r.error ?? 'Sin respuesta.'); },
      error: (e) => { this.busy.set(false); this.captcha = ''; this.error.set(mrError(e)); },
    });
  }
}
