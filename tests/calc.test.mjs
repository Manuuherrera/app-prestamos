import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLoan, loanTerms, totalsByCurrency, lateFeeStart, feeOn, profitReport, paymentsByMonth, scheduleDates } from '../js/calc.js';
import { parseAmount, money } from '../js/format.js';

const base = {
  id: 'l1',
  personId: 'p1',
  direction: 'lent',
  currency: 'ARS',
  capital: 100000,
  startDate: '2026-01-01',
  dueDate: '2026-02-01',
  mode: 'percent',
  percent: 20,
  dailyAmount: 0,
  lateFeePerDay: 1000,
  lateFeeFrom: null,
  payments: [],
};
const loan = (over = {}) => ({ ...base, ...over });

test('porcentaje: total = capital + %', () => {
  assert.equal(loanTerms(loan()).total, 120000);
  assert.equal(loanTerms(loan()).interest, 20000);
  assert.equal(loanTerms(loan({ percent: 0 })).total, 100000);
});

test('al día y vence pronto', () => {
  assert.equal(computeLoan(loan(), '2026-01-15').status, 'current');
  assert.equal(computeLoan(loan(), '2026-01-29').status, 'dueSoon');
  assert.equal(computeLoan(loan(), '2026-02-01').status, 'dueSoon');
  assert.equal(computeLoan(loan(), '2026-02-01').mora, 0);
});

test('vencido: corre la mora fija desde el día siguiente al vencimiento', () => {
  const c = computeLoan(loan(), '2026-02-05');
  assert.equal(c.status, 'overdue');
  assert.equal(c.daysOverdue, 4);
  assert.equal(c.moraDays, 4);
  assert.equal(c.mora, 4000);
  assert.equal(c.balance, 124000);
});

test('pagar el saldo del día corta la mora', () => {
  // El 3/2 el saldo es 120.000 + 2 días de mora (2/2 y 3/2).
  const l = loan({ payments: [{ id: 'x', date: '2026-02-03', amount: 122000 }] });
  const c = computeLoan(l, '2026-03-01');
  assert.equal(c.mora, 2000);
  assert.equal(c.balance, 0);
  assert.equal(c.status, 'paid');
});

test('pago parcial: la mora sigue corriendo mientras quede saldo', () => {
  const l = loan({ payments: [{ id: 'x', date: '2026-01-20', amount: 50000 }] });
  const c = computeLoan(l, '2026-02-11');
  assert.equal(c.paid, 50000);
  assert.equal(c.mora, 10000);
  assert.equal(c.balance, 80000);
});

test('préstamo viejo: "cobrar mora desde" posterga el inicio de la mora', () => {
  const l = loan({ lateFeeFrom: '2026-03-01' });
  assert.equal(lateFeeStart(l), '2026-03-01');
  const c = computeLoan(l, '2026-03-03');
  assert.equal(c.moraDays, 3);
  assert.equal(c.mora, 3000);
  // Una fecha anterior al vencimiento no adelanta la mora.
  assert.equal(lateFeeStart(loan({ lateFeeFrom: '2026-01-10' })), '2026-02-02');
});

test('sin mora acordada: vencido pero no suma', () => {
  const c = computeLoan(loan({ lateFeePerDay: 0 }), '2026-03-01');
  assert.equal(c.status, 'overdue');
  assert.equal(c.mora, 0);
  assert.equal(c.balance, 120000);
});

test('pagos futuros no cuentan todavía', () => {
  const l = loan({ payments: [{ id: 'x', date: '2026-01-20', amount: 10000 }] });
  assert.equal(computeLoan(l, '2026-01-10').paid, 0);
});

test('interés diario: total = capital + interés por día × días (desde el día siguiente)', () => {
  // Caso real: 600.000 del 5/11 al 11/11 a 25.000 por día → 6 días, 150.000 de interés, total 750.000.
  const l = loan({ mode: 'daily', capital: 600000, dailyAmount: 25000, startDate: '2026-11-05', dueDate: '2026-11-11' });
  const t = loanTerms(l);
  assert.equal(t.days, 6);
  assert.equal(t.interest, 150000);
  assert.equal(t.total, 750000);
  // Se paga todo junto al final: sin pagos antes del vencimiento sigue al día.
  assert.equal(computeLoan(l, '2026-11-06').status, 'current');
  assert.equal(computeLoan(l, '2026-11-09').status, 'dueSoon');
});

test('interés diario vencido con saldo: corre la mora', () => {
  const l = loan({
    mode: 'daily',
    dailyAmount: 5000,
    dueDate: '2026-01-31',
    lateFeePerDay: 2000,
    payments: [{ id: 'a', date: '2026-01-31', amount: 240000 }],
  });
  // 100.000 + 30 × 5.000 = 250.000; pagó 240.000; 3 días de mora.
  const c = computeLoan(l, '2026-02-03');
  assert.equal(c.status, 'overdue');
  assert.equal(c.mora, 6000);
  assert.equal(c.balance, 16000);
});

test('condonado: congela la mora en la fecha de condonación', () => {
  const l = loan({ forgivenAt: '2026-02-03' });
  const c = computeLoan(l, '2026-03-01');
  assert.equal(c.status, 'forgiven');
  assert.equal(c.mora, 2000);
});

test('totales por moneda: solo préstamos abiertos', () => {
  const items = [
    { loan: loan(), c: computeLoan(loan(), '2026-02-05') },
    { loan: loan({ currency: 'USD', capital: 100, percent: 10 }), c: computeLoan(loan({ currency: 'USD', capital: 100, percent: 10, lateFeePerDay: 0 }), '2026-01-10') },
    { loan: loan(), c: computeLoan(loan({ payments: [{ id: 'p', date: '2026-01-02', amount: 120000 }] }), '2026-02-05') },
  ];
  const t = totalsByCurrency(items);
  assert.equal(t.ARS.balance, 124000);
  assert.equal(t.ARS.count, 1);
  assert.equal(t.ARS.overdue, 1);
  assert.equal(t.USD.balance, 110);
});

test('cambio de mora desde una fecha: lo anterior queda igual', () => {
  // Vence 1/2. Mora 1000 del 2/2 al 9/2 (8 días), desde el 10/2 pasa a 3000.
  const l = loan({ lateFeeChanges: [{ id: 'c1', from: '2026-02-10', amount: 3000 }] });
  assert.equal(feeOn(l, '2026-02-09'), 1000);
  assert.equal(feeOn(l, '2026-02-10'), 3000);
  const c = computeLoan(l, '2026-02-12');
  assert.equal(c.mora, 8 * 1000 + 3 * 3000);
  assert.equal(c.moraDays, 11);
  assert.equal(c.currentFee, 3000);
  assert.deepEqual(
    c.moraSegments.map((s) => [s.from, s.to, s.days, s.fee, s.subtotal]),
    [
      ['2026-02-02', '2026-02-09', 8, 1000, 8000],
      ['2026-02-10', '2026-02-12', 3, 3000, 9000],
    ],
  );
});

test('cambio de mora a cero: deja de sumar pero lo pasado queda', () => {
  const l = loan({ lateFeeChanges: [{ id: 'c1', from: '2026-02-05', amount: 0 }] });
  const c = computeLoan(l, '2026-03-01');
  assert.equal(c.mora, 3000);
  assert.equal(c.status, 'overdue');
});

test('mora base cero con cambio posterior: empieza a cobrar desde el cambio', () => {
  const l = loan({ lateFeePerDay: 0, lateFeeChanges: [{ id: 'c1', from: '2026-02-20', amount: 500 }] });
  assert.equal(computeLoan(l, '2026-02-21').mora, 1000);
});

test('mora por porcentaje diario sobre el capital (no baja con pagos parciales)', () => {
  // 1 % diario de 100.000 = 1.000 por día
  const l = loan({ lateFeePerDay: undefined, lateFee: { type: 'percent', value: 1, period: 'day' }, payments: [{ id: 'p', date: '2026-01-20', amount: 50000 }] });
  const c = computeLoan(l, '2026-02-05');
  assert.equal(c.mora, 4000);
  assert.equal(c.balance, 120000 + 4000 - 50000);
});

test('mora por semana y por mes se prorratea por día', () => {
  const week = loan({ lateFee: { type: 'percent', value: 7, period: 'week' } }); // 7.000/semana → 1.000/día
  assert.equal(computeLoan(week, '2026-02-04').mora, 3000);
  const month = loan({ lateFee: { type: 'fixed', value: 30000, period: 'month' } }); // 30.000/mes → 1.000/día
  assert.equal(computeLoan(month, '2026-02-04').mora, 3000);
  const odd = loan({ lateFee: { type: 'percent', value: 1, period: 'week' } }); // 1.000/7 = 142,86 por día
  assert.equal(computeLoan(odd, '2026-02-08').mora, 1000.02); // 7 × 142,86
});

test('cambio de fijo a porcentaje desde una fecha', () => {
  const l = loan({ lateFeeChanges: [{ id: 'c', from: '2026-02-04', rate: { type: 'percent', value: 2, period: 'day' } }] });
  const c = computeLoan(l, '2026-02-05');
  assert.equal(c.mora, 2 * 1000 + 2 * 2000);
  assert.equal(c.moraSegments.length, 2);
  assert.equal(c.currentRate.type, 'percent');
});

test('reporte de ganancia: los pagos cubren primero el capital', () => {
  const a = loan({ payments: [{ id: 'p', date: '2026-01-20', amount: 120000 }] }); // cerrado, ganó 20.000
  const b = loan({ capital: 50000, percent: 10, payments: [{ id: 'q', date: '2026-01-10', amount: 20000 }] }); // abierto
  const f = loan({ capital: 30000, percent: 50, forgivenAt: '2026-01-15', payments: [{ id: 'r', date: '2026-01-05', amount: 10000 }] });
  const asOf = '2026-01-25';
  const r = profitReport([a, b, f].map((l) => ({ loan: l, c: computeLoan(l, asOf) })));
  assert.equal(r.invested, 180000);
  assert.equal(r.collected, 150000);
  assert.equal(r.realized, 20000);
  assert.equal(r.inStreet, 30000);
  assert.equal(r.pending, 5000);
  assert.equal(r.balance, 35000);
  assert.equal(r.lost, 20000);
  assert.equal(r.forgivenProfit, 15000);
  assert.equal(r.open, 1);
  assert.equal(r.closed, 2);
  assert.ok(Math.abs(r.roi - 20000 / 180000) < 1e-9);
});

test('reparto del interés: porcentaje (60 % total, el amigo 10 puntos)', () => {
  const l = loan({ percent: 60, partner: { name: 'Juan', value: 10, includeMora: false } });
  const c = computeLoan(l, '2026-02-03'); // 2 días de mora × 1.000
  assert.equal(c.total, 160000); // el deudor debe lo mismo: capital + 60 %
  assert.equal(c.partnerInterest, 10000);
  assert.equal(c.partnerMora, 0); // la mora es toda mía
  assert.equal(c.myProfit, 50000 + 2000);
  assert.equal(c.balance, 162000);
});

test('reparto del interés: diario (10.000/día, el amigo 4.000) con mora compartida', () => {
  const l = loan({ mode: 'daily', dailyAmount: 10000, dueDate: '2026-01-11', partner: { name: 'Juan', value: 4000, includeMora: true } });
  const c = computeLoan(l, '2026-01-13'); // 10 días de interés, 2 de mora
  assert.equal(c.interest, 100000);
  assert.equal(c.partnerInterest, 40000);
  assert.equal(c.partnerMora, 800); // 40 % de 2.000
  assert.equal(c.myProfit, 60000 + 1200);
});

test('reporte con reparto: tu ganancia y la de terceros son proporcionales a lo cobrado', () => {
  const l = loan({ percent: 60, lateFeePerDay: 0, partner: { name: 'Juan', value: 10 }, payments: [{ id: 'p', date: '2026-01-20', amount: 130000 }] });
  const r = profitReport([{ loan: l, c: computeLoan(l, '2026-01-25') }]);
  // Cobró 30.000 de ganancia de 60.000 → 1/6 es del amigo.
  assert.equal(r.realized, 25000);
  assert.equal(r.partnerRealized, 5000);
  assert.equal(r.pending, 25000);
  assert.equal(r.partnerPending, 5000);
  assert.equal(r.invested, 100000); // el capital no cambia
});

// --- Cuotas -------------------------------------------------------------------
const cuotas = (over = {}) =>
  loan({
    mode: 'installments',
    capital: 100000,
    startDate: '2026-01-05',
    dueDate: '2026-04-01',
    graceDays: 5,
    lateFeePerDay: 1000,
    installments: [
      { id: 'q1', date: '2026-02-01', amount: 40000 },
      { id: 'q2', date: '2026-03-01', amount: 40000 },
      { id: 'q3', date: '2026-04-01', amount: 40000 },
    ],
    ...over,
  });

test('cuotas: fechas mensuales respetan fin de mes', () => {
  assert.deepEqual(scheduleDates('2026-01-31', 3, 'monthly'), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.deepEqual(scheduleDates('2026-01-01', 3, 'weekly'), ['2026-01-01', '2026-01-08', '2026-01-15']);
  assert.deepEqual(scheduleDates('2026-01-01', 2, 'custom', 10), ['2026-01-01', '2026-01-11']);
});

test('cuotas: total = suma de cuotas, ganancia = total − capital', () => {
  const t = loanTerms(cuotas());
  assert.equal(t.total, 120000);
  assert.equal(t.interest, 20000);
  assert.equal(t.count, 3);
});

test('cuotas: dentro del margen no hay mora', () => {
  const c = computeLoan(cuotas(), '2026-02-06'); // vence 1/2, margen hasta el 6/2
  assert.equal(c.mora, 0);
  assert.equal(c.status, 'dueSoon');
  assert.equal(c.installments[0].state, 'grace');
});

test('cuotas: la mora corre desde que termina el margen', () => {
  const c = computeLoan(cuotas(), '2026-02-09'); // 7, 8 y 9 de febrero
  assert.equal(c.mora, 3000);
  assert.equal(c.status, 'overdue');
  assert.equal(c.installments[0].state, 'late');
  assert.equal(c.installments[0].daysLate, 3);
  assert.equal(c.balance, 123000);
});

test('cuotas: pagar la cuota atrasada corta su mora', () => {
  const c = computeLoan(cuotas({ payments: [{ id: 'p', date: '2026-02-08', amount: 40000 }] }), '2026-02-20');
  assert.equal(c.mora, 2000); // 7 y 8 de febrero
  assert.equal(c.installments[0].state, 'paid');
  assert.equal(c.status, 'current');
  assert.equal(c.nextInstallment.n, 2);
});

test('cuotas: con dos atrasadas se cobra por cada una', () => {
  const c = computeLoan(cuotas(), '2026-03-08');
  // Cuota 1: del 7/2 al 8/3 = 30 días. Cuota 2: 7/3 y 8/3 = 2 días.
  assert.equal(c.installments[0].mora, 30000);
  assert.equal(c.installments[1].mora, 2000);
  assert.equal(c.mora, 32000);
  assert.equal(c.lateCount, 2);
});

test('cuotas: mora en % se calcula sobre lo que falta de la cuota', () => {
  const l = cuotas({ lateFee: { type: 'percent', value: 1, period: 'day' }, payments: [{ id: 'p', date: '2026-02-01', amount: 20000 }] });
  const c = computeLoan(l, '2026-02-08'); // falta 20.000 de la cuota 1 → 200 por día, 2 días
  assert.equal(c.mora, 400);
});

test('cobros por mes', () => {
  const l = loan({
    payments: [
      { id: 'a', date: '2026-01-05', amount: 1000 },
      { id: 'b', date: '2026-03-10', amount: 2000 },
      { id: 'c', date: '2026-03-20', amount: 500 },
      { id: 'd', date: '2025-06-01', amount: 9999 },
    ],
  });
  assert.deepEqual(paymentsByMonth([l], '2026-03-25', 3), [
    { month: '2026-01', total: 1000 },
    { month: '2026-02', total: 0 },
    { month: '2026-03', total: 2500 },
  ]);
});

test('parseAmount entiende el formato argentino', () => {
  assert.equal(parseAmount('120000'), 120000);
  assert.equal(parseAmount('120.000'), 120000);
  assert.equal(parseAmount('1.500'), 1500);
  assert.equal(parseAmount('1.234.567,89'), 1234567.89);
  assert.equal(parseAmount('1500,5'), 1500.5);
  assert.equal(parseAmount('1500.75'), 1500.75);
  assert.equal(parseAmount('$ 2.000'), 2000);
  assert.ok(Number.isNaN(parseAmount('')));
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('-5')));
});

test('money formatea pesos y dólares', () => {
  assert.match(money(120000, 'ARS'), /120\.000/);
  assert.match(money(1500.5, 'USD'), /1\.500,50/);
  assert.match(money(1500.5, 'USD'), /US\$/);
});
