/** Contratos de la API de Mi renta (/api/v1/my-rent). */
export interface MrMe { id: string; email: string; maskedDocument: string; role: 'Taxpayer' | 'Accountant' | 'TaxRulesAdmin'; remindersOptOut: boolean; }
export interface MrTokens { accessToken: string; accessTokenExpiresAt: string; refreshToken: string; refreshTokenExpiresAt: string; user: MrMe; }
export interface MrMessage { message: string; }

export interface MrCase { id: string; taxYear: number; returnType: string; status: string; blockedReason: string | null; createdAt: string; updatedAt: string; isOwner: boolean; maskedTaxpayerDocument: string; }
export interface MrOption { value: string; label: string; }
export interface MrTask {
  id: string; code: string; kind: 'Question' | 'DocumentRequest' | 'Confirmation' | 'ProfessionalReview'; prompt: string; help: string | null;
  answerType: 'SingleChoice' | 'MultiChoice' | 'Amount' | 'Integer' | 'Text' | 'Document' | 'Confirmation';
  options: MrOption[] | null; state: 'Open' | 'Answered' | 'Deferred' | 'Cancelled'; blocksCalculation: boolean; related: unknown;
}
export interface MrProgress {
  status: string; blockedReason: string | null; questionsAnswered: number; questionsTotal: number; documentsTotal: number; documentsProcessing: number;
  openReconciliations: number; openConfirmations: number; needsAccountant: boolean; canCalculate: boolean; latestCalculationStatus: string | null;
  currentDraftId: string | null; currentDraftStatus: string | null; nextTasks: MrTask[]; percentComplete: number;
}
export interface MrChatMessage { id: string; role: 'User' | 'Assistant' | 'System'; content: string; createdAt: string; }
export interface MrEvidence { id: string; field: string; extractedAmount: number | null; confirmedAmount: number | null; locator: string; confidence: number; status: string; }
export interface MrDocument { id: string; fileName: string; format: string; sizeBytes: number; kind: string; status: string; note: string | null; createdAt: string; processedAt: string | null; evidence: MrEvidence[]; transactionCount: number; }
export interface MrUploadResult { document: MrDocument; duplicate: boolean; }
export interface MrTransaction { id: string; date: string; amount: number; description: string; taxTreatment: string; reviewStatus: string; sourceDocumentId: string; locator: string; }
export interface MrReconciliation { id: string; kind: string; explanation: string; isOpen: boolean; resolution: string | null; transactions: MrTransaction[]; allowedResolutions: string[]; }
export interface MrFact { id: string; code: string; amount: number | null; textValue: string | null; source: string; status: string; version: number; evidenceIds: string[]; createdAt: string; note: string | null; }
export interface MrIssue { code: string; message: string; }
export interface MrLine { concept: string; label: string; value: number; ruleCode: string; formula: string; sourceFactIds: string[]; warnings: string[]; order: number; }
export interface MrCalculation {
  id: string; status: 'Blocked' | 'Preliminary' | 'ReadyForApproval'; isPreview: boolean; engineVersion: string; ruleSetVersion: string; createdAt: string;
  blocking: MrIssue[]; warnings: MrIssue[]; lines: MrLine[]; obligation: { mustFile: boolean | null; reasons: string[] }; rulesUsed: string[]; draftId: string | null;
}
export interface MrDraftLine { id: string; concept: string; boxNumber: number | null; label: string; value: number; ruleCode: string; formula: string; sourceFactIds: string[]; warnings: string[]; sortOrder: number; }
export interface MrDraft {
  id: string; version: number; status: string; formVersion: string; calculationId: string; calculationStatus: string; createdAt: string;
  reviewedByUserId: string | null; reviewedAt: string | null; reviewComment: string | null; lines: MrDraftLine[]; disclaimers: string[];
}
export interface MrRule { code: string; description: string; legalReference: string; sourceUrl: string | null; status: string; approvedAt: string | null; }
export interface MrDianStatus { enabled: boolean; officialConsultUrl: string; notice: string; }
export interface MrDianOutcome<T> { disabled: boolean; ok: boolean; value: T | null; error: string | null; officialConsultUrl: string; }

export const ACCOUNTANT_FACTS = [
  { code: 'accountant.advance_payment_next_year', label: 'Anticipo de renta del año siguiente' },
  { code: 'accountant.previous_year_advance', label: 'Anticipo liquidado en la declaración anterior' },
  { code: 'accountant.dependents_additional_deduction', label: 'Deducción adicional por dependientes (art. 336)' },
] as const;

export const STATUS_LABELS: Partial<Record<string, string>> = {
  NotStarted: 'Sin iniciar', CollectingInformation: 'Recopilando información', AwaitingDocument: 'Esperando documentos',
  ProcessingDocument: 'Procesando documentos', AwaitingUserAnswer: 'Esperando tus respuestas', NeedsProfessionalReview: 'Requiere revisión de contador',
  ReadyForCalculation: 'Listo para calcular', Calculating: 'Calculando', ReadyForReview: 'Borrador listo para revisión',
  ApprovedForExport: 'Aprobado por contador', Completed: 'Completado', Blocked: 'Fuera del alcance del asistente',
};

export const RESOLUTION_LABELS: Partial<Record<string, string>> = {
  is_duplicate: 'Es el mismo movimiento (duplicado)', not_duplicate: 'Son movimientos distintos',
  own_transfer: 'Transferencia entre mis cuentas', not_own_transfer: 'No es entre mis cuentas',
  reversal: 'Es un reverso', not_reversal: 'No es un reverso',
  labor_income: 'Pago laboral', loan: 'Préstamo', non_taxable: 'Ingreso no gravado (p. ej. regalo familiar)', other_income: 'Otro ingreso',
};
