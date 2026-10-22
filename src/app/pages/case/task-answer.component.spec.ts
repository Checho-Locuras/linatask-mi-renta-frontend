import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MrTaskAnswerComponent } from './task-answer.component';
import { MiRentaApiService } from '../../core/mi-renta-api.service';
import { MrTask } from '../../core/mi-renta.models';

const task = (over: Partial<MrTask>): MrTask => ({
  id: 't1', code: 'q.x', kind: 'Question', prompt: '¿Pregunta?', help: null, answerType: 'Amount', options: null, state: 'Open',
  blocksCalculation: true, related: null, ...over,
});

describe('MrTaskAnswerComponent', () => {
  let fixture: ComponentFixture<MrTaskAnswerComponent>;
  let api: jasmine.SpyObj<MiRentaApiService>;

  beforeEach(() => {
    api = jasmine.createSpyObj<MiRentaApiService>('MiRentaApiService', ['answer']);
    TestBed.configureTestingModule({ imports: [MrTaskAnswerComponent], providers: [{ provide: MiRentaApiService, useValue: api }] });
    fixture = TestBed.createComponent(MrTaskAnswerComponent);
    fixture.componentInstance.caseId = 'c1';
  });

  it('interpreta montos colombianos', () => {
    expect(MrTaskAnswerComponent.parse('1.234.567')).toBe(1234567);
    expect(MrTaskAnswerComponent.parse('$ 84,000,000')).toBe(84000000);
    expect(MrTaskAnswerComponent.parse('')).toBeNull();
  });

  it('envía el monto y reutiliza la clave de idempotencia al reintentar', () => {
    const c = fixture.componentInstance;
    c.task = task({});
    api.answer.and.returnValues(throwError(() => new Error('red')), of({ task: task({}), progress: {} as never }));
    c.amountText = '5.000.000';
    c.submit();
    c.submit();
    const [first, second] = api.answer.calls.allArgs();
    expect(first[2]).toBe(5000000);
    expect(first[3]).toBe(second[3]);
  });

  it('valida opción múltiple y confirmación de evidencia', () => {
    const c = fixture.componentInstance;
    c.task = task({ answerType: 'MultiChoice', options: [{ value: 'labor', label: 'Salario' }] });
    c.submit();
    expect(api.answer).not.toHaveBeenCalled();
    expect(c.error()).toContain('al menos una');

    api.answer.and.returnValue(of({ task: task({}), progress: {} as never }));
    c.task = task({ answerType: 'Confirmation', kind: 'Confirmation' });
    c.evidence = [{ id: 'e1', field: 'labor.gross_income', extractedAmount: 100, confirmedAmount: null, locator: 'página 1', confidence: 0.8, status: 'Proposed' }];
    c.ngOnChanges();
    c.decisions['e1'] = { action: 'correct', amount: '120' };
    c.submit();
    expect(api.answer.calls.mostRecent().args[2]).toEqual({ items: [{ evidenceId: 'e1', action: 'correct', amount: 120 }] });
  });
});
