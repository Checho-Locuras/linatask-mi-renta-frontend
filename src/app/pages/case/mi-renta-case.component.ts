import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { MiRentaApiService, mrError, newIdempotencyKey } from '../../core/mi-renta-api.service';
import { MiRentaSessionService } from '../../core/mi-renta-session.service';
import {
  ACCOUNTANT_FACTS, MrCalculation, MrCase, MrChatMessage, MrDocument, MrDraft, MrEvidence, MrProgress, MrReconciliation, MrTask,
  RESOLUTION_LABELS, STATUS_LABELS,
} from '../../core/mi-renta.models';
import { MrTaskAnswerComponent } from './task-answer.component';

type Tab = 'assistant' | 'documents' | 'movements' | 'calculation' | 'accountant';

/** Espacio de trabajo del expediente: asistente, documentos, movimientos, cálculo/borrador y contador. */
@Component({
  selector: 'app-mi-renta-case',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CurrencyPipe, DatePipe, MrTaskAnswerComponent],
  templateUrl: './mi-renta-case.component.html',
})
export class MiRentaCaseComponent implements OnInit, OnDestroy {
  private readonly api = inject(MiRentaApiService);
  readonly session = inject(MiRentaSessionService);
  private readonly route = inject(ActivatedRoute);
  @ViewChild('chatBox') chatBox?: ElementRef<HTMLDivElement>;

  readonly statusLabels = STATUS_LABELS;
  readonly resolutionLabels = RESOLUTION_LABELS;
  readonly accountantFacts = ACCOUNTANT_FACTS;
  caseId = '';
  tab = signal<Tab>('assistant');
  theCase = signal<MrCase | null>(null);
  progress = signal<MrProgress | null>(null);
  messages = signal<MrChatMessage[]>([]);
  documents = signal<MrDocument[]>([]);
  reconciliations = signal<MrReconciliation[]>([]);
  calculation = signal<MrCalculation | null>(null);
  draft = signal<MrDraft | null>(null);
  error = signal<string | null>(null);
  notice = signal<string | null>(null);
  busy = signal(false);
  /** El expediente no existe o no pertenece al usuario (la API responde 404 en ambos casos). */
  notFound = signal(false);
  draftText = '';
  accountantEmail = '';
  reviewComment = '';
  ackRules = false;
  accountantValues: Record<string, string> = {};
  private pendingMessageKey: string | null = null;
  private poll?: ReturnType<typeof setInterval>;

  readonly isOwner = computed(() => this.theCase()?.isOwner ?? false);
  readonly isAccountant = computed(() => !this.isOwner() && this.session.user()?.role === 'Accountant');
  readonly openTasks = computed(() => (this.progress()?.nextTasks ?? []).filter((t) => t.state === 'Open'));
  readonly evidenceById = computed(() => {
    const m = new Map<string, MrEvidence>();
    for (const d of this.documents()) for (const e of d.evidence) m.set(e.id, e);
    return m;
  });

  ngOnInit(): void {
    this.caseId = this.route.snapshot.paramMap.get('id') ?? '';
    this.reload();
    // Mientras haya documentos en proceso se consulta el avance (el procesamiento es asíncrono).
    this.poll = setInterval(() => { if (!this.notFound() && (this.progress()?.documentsProcessing ?? 0) > 0) this.reload(); }, 4000);
  }

  ngOnDestroy(): void { if (this.poll) clearInterval(this.poll); }

  setTab(t: Tab): void { this.tab.set(t); this.error.set(null); this.notice.set(null); if (t === 'calculation' || t === 'accountant') this.loadCalculation(); }

  reload(): void {
    forkJoin({
      c: this.api.getCase(this.caseId), p: this.api.progress(this.caseId), m: this.api.messages(this.caseId),
      d: this.api.documents(this.caseId), r: this.api.reconciliations(this.caseId),
    }).subscribe({
      next: ({ c, p, m, d, r }) => {
        this.theCase.set(c); this.progress.set(p); this.messages.set(m); this.documents.set(d); this.reconciliations.set(r);
        setTimeout(() => this.chatBox?.nativeElement.scrollTo({ top: this.chatBox.nativeElement.scrollHeight }));
      },
      error: (e) => {
        if (e instanceof HttpErrorResponse && e.status === 404 && !this.theCase()) { this.notFound.set(true); return; }
        this.error.set(mrError(e));
      },
    });
  }

  evidenceFor(t: MrTask): MrEvidence[] {
    const ids = Array.isArray(t.related) ? (t.related as string[]) : [];
    return ids.map((id) => this.evidenceById().get(id)).filter((e): e is MrEvidence => !!e);
  }

  send(): void {
    const text = this.draftText.trim();
    if (!text) return;
    this.pendingMessageKey ??= newIdempotencyKey(); // reintentos del mismo mensaje no se duplican
    this.busy.set(true);
    this.api.sendMessage(this.caseId, text, this.pendingMessageKey).subscribe({
      next: (r) => {
        this.busy.set(false); this.draftText = ''; this.pendingMessageKey = null;
        this.messages.update((m) => [...m, r.userMessage, r.reply]); this.progress.set(r.progress);
        setTimeout(() => this.chatBox?.nativeElement.scrollTo({ top: this.chatBox.nativeElement.scrollHeight }));
      },
      error: (e) => { this.busy.set(false); this.error.set(mrError(e)); },
    });
  }

  onFile(ev: Event, taskId?: string): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { this.error.set('El archivo supera 15 MB.'); return; }
    this.busy.set(true);
    this.api.upload(this.caseId, file, taskId).subscribe({
      next: (r) => { this.busy.set(false); this.notice.set(r.duplicate ? 'Ese archivo ya estaba en tu expediente.' : 'Documento recibido. Lo estamos procesando.'); this.reload(); },
      error: (e) => { this.busy.set(false); this.error.set(mrError(e)); },
    });
  }

  download(d: MrDocument): void {
    this.api.downloadUrl(this.caseId, d.id).subscribe({
      next: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
      error: (e) => this.error.set(mrError(e)),
    });
  }

  remove(d: MrDocument): void {
    if (!confirm(`¿Eliminar «${d.fileName}»? Los valores confirmados desde este documento dejarán de usarse.`)) return;
    this.api.deleteDocument(this.caseId, d.id).subscribe({ next: () => this.reload(), error: (e) => this.error.set(mrError(e)) });
  }

  resolve(r: MrReconciliation, resolution: string): void {
    this.api.resolve(this.caseId, r.id, resolution).subscribe({ next: () => this.reload(), error: (e) => this.error.set(mrError(e)) });
  }

  loadCalculation(): void {
    forkJoin({ c: this.api.latestCalculation(this.caseId), d: this.api.draft(this.caseId) }).subscribe({
      next: ({ c, d }) => { this.calculation.set(c); this.draft.set(d); },
      error: (e) => this.error.set(mrError(e)),
    });
  }

  calculate(): void {
    this.busy.set(true);
    this.api.calculate(this.caseId).subscribe({
      next: (c) => { this.busy.set(false); this.calculation.set(c); this.reload(); this.loadCalculation(); },
      error: (e) => { this.busy.set(false); this.error.set(mrError(e)); },
    });
  }

  exportDraft(format: 'json' | 'csv'): void {
    this.api.export(this.caseId, format).subscribe({
      next: (blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `mi-renta-borrador-2025.${format}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
      error: (e) => this.error.set(mrError(e)),
    });
  }

  markFiled(): void {
    if (!confirm('¿Confirmas que ya presentaste la declaración en el portal de la DIAN con tu cuenta?')) return;
    this.api.markFiled(this.caseId).subscribe({ next: () => this.reload(), error: (e) => this.error.set(mrError(e)) });
  }

  grant(): void {
    const email = this.accountantEmail.trim();
    if (!email.includes('@')) { this.error.set('Escribe el correo de tu contador.'); return; }
    this.api.grantAccountant(this.caseId, email).subscribe({
      next: (r) => { this.notice.set(r.message); this.accountantEmail = ''; },
      error: (e) => this.error.set(mrError(e)),
    });
  }

  revoke(): void {
    this.api.revokeAccountants(this.caseId).subscribe({ next: () => this.notice.set('Se revocó el acceso de los contadores.'), error: (e) => this.error.set(mrError(e)) });
  }

  saveAccountantFact(code: string): void {
    const digits = (this.accountantValues[code] ?? '').replace(/[^\d]/g, '');
    if (!digits) { this.error.set('Escribe un valor (0 si no aplica).'); return; }
    this.api.setFact(this.caseId, code, Number(digits)).subscribe({
      next: () => { this.notice.set('Valor guardado.'); this.reload(); },
      error: (e) => this.error.set(mrError(e)),
    });
  }

  review(decision: 'approve' | 'reject'): void {
    const d = this.draft();
    if (!d) return;
    this.api.review(this.caseId, { draftId: d.id, version: d.version, decision, comment: this.reviewComment.trim() || undefined, acknowledgePendingRules: this.ackRules })
      .subscribe({ next: (r) => { this.draft.set(r); this.notice.set(decision === 'approve' ? 'Borrador aprobado.' : 'Borrador devuelto.'); this.reload(); }, error: (e) => this.error.set(mrError(e)) });
  }

  toggleReminders(optOut: boolean): void {
    this.api.setReminders(optOut).subscribe({ next: () => this.session.updateUser({ remindersOptOut: optOut }), error: (e) => this.error.set(mrError(e)) });
  }
}
