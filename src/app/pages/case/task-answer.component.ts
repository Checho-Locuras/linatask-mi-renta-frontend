import { Component, EventEmitter, Input, Output, OnChanges, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MiRentaApiService, mrError, newIdempotencyKey } from '../../core/mi-renta-api.service';
import { MrEvidence, MrTask } from '../../core/mi-renta.models';

const FIELD_LABELS: Record<string, string> = {
  'labor.gross_income': 'Total de ingresos brutos laborales',
  'labor.mandatory_pension_contributions': 'Aportes obligatorios a pensión',
  'labor.mandatory_health_contributions': 'Aportes obligatorios a salud',
  'labor.withholding': 'Retención en la fuente',
};

/** Responde una tarea del asistente. La clave de idempotencia se conserva entre reintentos de la misma respuesta. */
@Component({
  selector: 'app-mr-task-answer',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe],
  template: `
    <div class="mr-task">
      <p class="prompt">{{ task.prompt }}</p>
      <p class="mr-muted" *ngIf="task.help">{{ task.help }}</p>
      <div class="mr-alert err" *ngIf="error()" role="alert">{{ error() }}</div>

      <ng-container [ngSwitch]="task.answerType">
        <div *ngSwitchCase="'SingleChoice'" class="mr-options" role="radiogroup" [attr.aria-label]="task.prompt">
          <label *ngFor="let o of task.options"><input type="radio" [name]="task.id" [value]="o.value" [(ngModel)]="single" /> {{ o.label }}</label>
        </div>
        <div *ngSwitchCase="'MultiChoice'" class="mr-options">
          <label *ngFor="let o of task.options"><input type="checkbox" [checked]="multi.has(o.value)" (change)="toggle(o.value)" /> {{ o.label }}</label>
        </div>
        <div *ngSwitchCase="'Amount'" class="mr-field">
          <label [for]="task.id">Valor en pesos</label>
          <input [id]="task.id" inputmode="numeric" [(ngModel)]="amountText" placeholder="0" />
          <span class="mr-muted" *ngIf="parsedAmount() !== null">{{ parsedAmount() | currency: 'COP' : 'symbol-narrow' : '1.0-0' : 'es' }}</span>
        </div>
        <div *ngSwitchCase="'Integer'" class="mr-field">
          <label [for]="task.id">Número</label>
          <input [id]="task.id" type="number" min="0" max="20" step="1" [(ngModel)]="integer" />
        </div>
        <div *ngSwitchCase="'Confirmation'">
          <div class="mr-table-wrap" *ngIf="evidence.length">
            <table class="mr-table">
              <thead><tr><th>Dato</th><th class="num">Valor encontrado</th><th>Dónde</th><th>Acción</th></tr></thead>
              <tbody>
                <tr *ngFor="let e of evidence">
                  <td>{{ label(e.field) }}</td>
                  <td class="num">{{ e.extractedAmount | currency: 'COP' : 'symbol-narrow' : '1.0-0' : 'es' }}</td>
                  <td class="mr-muted">{{ e.locator }}</td>
                  <td>
                    <select [(ngModel)]="decisions[e.id].action" [attr.aria-label]="'Acción para ' + label(e.field)">
                      <option value="confirm">Es correcto</option>
                      <option value="correct">Corregir</option>
                      <option value="reject">No usar</option>
                    </select>
                    <input *ngIf="decisions[e.id].action === 'correct'" inputmode="numeric" [(ngModel)]="decisions[e.id].amount" placeholder="Valor correcto" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="mr-muted" *ngIf="!evidence.length">Abre la pestaña Documentos para ver los valores propuestos.</p>
        </div>
        <div *ngSwitchCase="'Document'"><p class="mr-muted">Súbelo en la pestaña Documentos, o continúa sin él.</p></div>
      </ng-container>

      <div class="mr-actions" *ngIf="task.kind !== 'ProfessionalReview'">
        <button *ngIf="task.answerType !== 'Document'" class="mr-btn small" type="button" (click)="submit()" [disabled]="busy()">Guardar respuesta</button>
        <button *ngIf="task.answerType === 'Document'" class="mr-btn secondary small" type="button" (click)="defer()" [disabled]="busy()">Continuar sin este documento</button>
      </div>
    </div>`,
})
export class MrTaskAnswerComponent implements OnChanges {
  @Input({ required: true }) caseId!: string;
  @Input({ required: true }) task!: MrTask;
  @Input() evidence: MrEvidence[] = [];
  @Output() answered = new EventEmitter<void>();
  private readonly api = inject(MiRentaApiService);
  busy = signal(false);
  error = signal<string | null>(null);
  single = '';
  multi = new Set<string>();
  amountText = '';
  integer: number | null = null;
  decisions: Record<string, { action: 'confirm' | 'correct' | 'reject'; amount: string }> = {};
  private key = newIdempotencyKey();
  private lastPayload = '';

  ngOnChanges(): void {
    for (const e of this.evidence) this.decisions[e.id] ??= { action: 'confirm', amount: '' };
  }

  label(field: string): string { return FIELD_LABELS[field] ?? field; }
  toggle(v: string): void { if (this.multi.has(v)) this.multi.delete(v); else this.multi.add(v); }

  /** Acepta "1.234.567", "1234567" o "1,234,567" (pesos enteros). */
  static parse(text: string): number | null {
    const digits = (text ?? '').replace(/[^\d]/g, '');
    return digits ? Number(digits) : null;
  }
  parsedAmount(): number | null { return MrTaskAnswerComponent.parse(this.amountText); }

  submit(): void {
    let value: unknown;
    switch (this.task.answerType) {
      case 'SingleChoice': if (!this.single) return this.fail('Elige una opción.'); value = this.single; break;
      case 'MultiChoice': if (!this.multi.size) return this.fail('Elige al menos una opción.'); value = [...this.multi]; break;
      case 'Amount': { const a = this.parsedAmount(); if (a === null) return this.fail('Escribe un valor (0 si no aplica).'); value = a; break; }
      case 'Integer': if (this.integer === null || this.integer < 0 || !Number.isInteger(this.integer)) return this.fail('Escribe un número entero.'); value = this.integer; break;
      case 'Confirmation': {
        const items = this.evidence.map((e) => {
          const d = this.decisions[e.id];
          return d.action === 'correct' ? { evidenceId: e.id, action: d.action, amount: MrTaskAnswerComponent.parse(d.amount) } : { evidenceId: e.id, action: d.action };
        });
        if (items.some((i) => 'amount' in i && i.amount === null)) return this.fail('Escribe el valor correcto.');
        value = { items };
        break;
      }
      default: return;
    }
    this.send(value);
  }

  defer(): void { this.send({ defer: true }); }

  private send(value: unknown): void {
    const payload = JSON.stringify(value);
    if (payload !== this.lastPayload) { this.key = newIdempotencyKey(); this.lastPayload = payload; }
    this.busy.set(true);
    this.error.set(null);
    this.api.answer(this.caseId, this.task.id, value, this.key).subscribe({
      next: () => { this.busy.set(false); this.answered.emit(); },
      error: (e) => { this.busy.set(false); this.error.set(mrError(e)); },
    });
  }

  private fail(m: string): void { this.error.set(m); }
}
