import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { MI_RENTA_API } from './mi-renta.config';
import {
  MrCalculation, MrCase, MrChatMessage, MrDianOutcome, MrDianStatus, MrDocument, MrDraft, MrFact, MrProgress, MrReconciliation,
  MrRule, MrTask, MrUploadResult,
} from './mi-renta.models';

/** Mensaje legible de un error del microservicio (ProblemDetails). */
export function mrError(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'No pudimos conectar con Mi renta. Revisa tu conexión e inténtalo de nuevo.';
    if (e.status === 429) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
    const body = e.error as { title?: string; message?: string } | null;
    return body?.title ?? body?.message ?? 'Ocurrió un error inesperado.';
  }
  return 'Ocurrió un error inesperado.';
}

export function newIdempotencyKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

@Injectable({ providedIn: 'root' })
export class MiRentaApiService {
  private readonly base = MI_RENTA_API;
  constructor(private http: HttpClient) {}

  private get opts() { return {}; }
  private c(caseId: string) { return `${this.base}/cases/${encodeURIComponent(caseId)}`; }

  listCases(): Observable<MrCase[]> { return this.http.get<MrCase[]>(`${this.base}/cases`, this.opts); }
  createCase(taxYear = 2025): Observable<MrCase> { return this.http.post<MrCase>(`${this.base}/cases`, { taxYear }, this.opts); }
  getCase(id: string): Observable<MrCase> { return this.http.get<MrCase>(this.c(id), this.opts); }
  progress(id: string): Observable<MrProgress> { return this.http.get<MrProgress>(`${this.c(id)}/progress`, this.opts); }
  tasks(id: string): Observable<MrTask[]> { return this.http.get<MrTask[]>(`${this.c(id)}/tasks`, this.opts); }
  answer(id: string, taskId: string, value: unknown, idempotencyKey = newIdempotencyKey()): Observable<{ task: MrTask; progress: MrProgress }> {
    return this.http.post<{ task: MrTask; progress: MrProgress }>(`${this.c(id)}/tasks/${taskId}/answers`, { value, idempotencyKey }, this.opts);
  }
  messages(id: string): Observable<MrChatMessage[]> { return this.http.get<MrChatMessage[]>(`${this.c(id)}/assistant/messages`, this.opts); }
  sendMessage(id: string, content: string, idempotencyKey = newIdempotencyKey()) {
    return this.http.post<{ userMessage: MrChatMessage; reply: MrChatMessage; progress: MrProgress }>(`${this.c(id)}/assistant/messages`, { content, idempotencyKey }, this.opts);
  }
  documents(id: string): Observable<MrDocument[]> { return this.http.get<MrDocument[]>(`${this.c(id)}/documents`, this.opts); }
  upload(id: string, file: File, taskId?: string): Observable<MrUploadResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (taskId) form.append('taskId', taskId);
    return this.http.post<MrUploadResult>(`${this.c(id)}/documents`, form, this.opts);
  }
  deleteDocument(id: string, docId: string): Observable<void> { return this.http.delete<void>(`${this.c(id)}/documents/${docId}`, this.opts); }
  /** URL absoluta y de corta duración para descargar (la sirve Mi renta tras revalidar el permiso). */
  downloadUrl(id: string, docId: string): Observable<string> {
    return this.http.post<{ url: string }>(`${this.c(id)}/documents/${docId}/download-url`, {}, this.opts).pipe(
      map((r) => new URL(r.url, new URL(this.base, location.href)).toString()));
  }
  facts(id: string): Observable<MrFact[]> { return this.http.get<MrFact[]>(`${this.c(id)}/facts`, this.opts); }
  setFact(id: string, code: string, amount: number | null, note?: string): Observable<MrFact> {
    return this.http.put<MrFact>(`${this.c(id)}/facts/${encodeURIComponent(code)}`, { amount, note }, this.opts);
  }
  reconciliations(id: string): Observable<MrReconciliation[]> { return this.http.get<MrReconciliation[]>(`${this.c(id)}/reconciliations`, this.opts); }
  resolve(id: string, recId: string, resolution: string): Observable<MrReconciliation> {
    return this.http.post<MrReconciliation>(`${this.c(id)}/reconciliations/${recId}/resolve`, { resolution }, this.opts);
  }
  calculate(id: string): Observable<MrCalculation> { return this.http.post<MrCalculation>(`${this.c(id)}/calculate`, {}, this.opts); }
  latestCalculation(id: string): Observable<MrCalculation | null> { return this.http.get<MrCalculation | null>(`${this.c(id)}/calculations/latest`, this.opts); }
  draft(id: string): Observable<MrDraft | null> { return this.http.get<MrDraft | null>(`${this.c(id)}/draft`, this.opts); }
  review(id: string, body: { draftId: string; version: number; decision: 'approve' | 'reject'; comment?: string; acknowledgePendingRules: boolean }): Observable<MrDraft> {
    return this.http.post<MrDraft>(`${this.c(id)}/draft/review`, body, this.opts);
  }
  export(id: string, format: 'json' | 'csv'): Observable<Blob> {
    return this.http.get(`${this.c(id)}/export?format=${format}`, { ...this.opts, responseType: 'blob' });
  }
  markFiled(id: string): Observable<void> { return this.http.post<void>(`${this.c(id)}/mark-filed`, {}, this.opts); }
  grantAccountant(id: string, accountantEmail: string) { return this.http.post<{ message: string }>(`${this.c(id)}/accountants`, { accountantEmail }, this.opts); }
  revokeAccountants(id: string): Observable<void> { return this.http.delete<void>(`${this.c(id)}/accountants`, this.opts); }
  rules(): Observable<MrRule[]> { return this.http.get<MrRule[]>(`${this.base}/rules`, this.opts); }
  setReminders(optOut: boolean): Observable<void> { return this.http.put<void>(`${this.base}/me/reminders`, { optOut }, this.opts); }
  unsubscribe(token: string) { return this.http.post<{ message: string }>(`${this.base}/reminders/unsubscribe`, { token }, this.opts); }
  dianStatus(): Observable<MrDianStatus> { return this.http.get<MrDianStatus>(`${this.base}/dian/status`, this.opts); }
  dianDeclarant(numDocumento: string, tipoDocumento: string, reCaptcha: string) {
    return this.http.post<MrDianOutcome<{ anoGravable: string | null; rawIndicators: Record<string, string | null>; plazo: string | null }>>(
      `${this.base}/dian/declarant`, { numDocumento, tipoDocumento, reCaptcha }, this.opts);
  }
}
