'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../finance-lib.js');

test('deutsche und internationale Geldformate werden korrekt gelesen',()=>{
  assert.equal(F.parseMoney('1.234,56 €'),1234.56);
  assert.equal(F.parseMoney('1,234.56'),1234.56);
  assert.equal(F.parseMoney('- 78,23 €'),-78.23);
  assert.equal(F.parseMoney('(42,50)'),-42.5);
  assert.equal(F.parseMoney('2.000'),2000);
});

test('deutsche und ISO-Daten werden normalisiert',()=>{
  assert.equal(F.normalizeDate('29.08.2026'),'2026-08-29');
  assert.equal(F.normalizeDate('29/08/26'),'2026-08-29');
  assert.equal(F.normalizeDate('2026-08-29'),'2026-08-29');
  assert.equal(F.normalizeDate('31.02.2026'),'');
});

test('monatliche Wiederholung erzeugt nichts vor Startdatum',()=>{
  const r={active:true,frequency:'monthly',day:5,start:'2026-08-29'};
  assert.deepEqual(F.recurrenceDates(r,'2026-08-01','2026-08-31'),[]);
  assert.deepEqual(F.recurrenceDates(r,'2026-09-01','2026-09-30'),['2026-09-05']);
});

test('Enddatum verhindert Zahlung nach Vertragsende',()=>{
  const r={active:true,frequency:'monthly',day:15,start:'2026-01-01',end:'2026-08-10'};
  assert.deepEqual(F.recurrenceDates(r,'2026-08-01','2026-08-31'),[]);
});

test('Zahlungstag 31 wird am Monatsende geklemmt',()=>{
  const r={active:true,frequency:'monthly',day:31,start:'2026-01-01'};
  assert.deepEqual(F.recurrenceDates(r,'2026-02-01','2026-02-28'),['2026-02-28']);
  assert.deepEqual(F.recurrenceDates({...r,start:'2028-01-01'},'2028-02-01','2028-02-29'),['2028-02-29']);
});

test('wöchentliche und 14-tägige Wiederholungen bleiben am Startanker',()=>{
  const weekly={active:true,frequency:'weekly',start:'2026-08-03'};
  assert.deepEqual(F.recurrenceDates(weekly,'2026-08-01','2026-08-20'),['2026-08-03','2026-08-10','2026-08-17']);
  const bi={active:true,frequency:'biweekly',start:'2026-08-03'};
  assert.deepEqual(F.recurrenceDates(bi,'2026-08-01','2026-08-31'),['2026-08-03','2026-08-17','2026-08-31']);
});

test('quartalsweise Wiederholung bleibt an Startmonat gekoppelt',()=>{
  const r={active:true,frequency:'quarterly',day:10,start:'2026-02-10'};
  assert.deepEqual(F.recurrenceDates(r,'2026-01-01','2026-12-31'),['2026-02-10','2026-05-10','2026-08-10','2026-11-10']);
});

test('Transaktionsfingerprint erkennt gleiche Buchung stabil',()=>{
  const a={date:'2026-08-29',amount:'78,23',type:'expense',title:'REWE Markt',accountId:'a1'};
  const b={date:'29.08.2026',amount:78.23,type:'expense',title:'rewe markt',accountId:'a1'};
  assert.equal(F.fingerprint(a),F.fingerprint(b));
  assert.notEqual(F.fingerprint(a),F.fingerprint({...b,amount:79.23}));
});

test('Tilgungsplan reduziert Restschuld und trennt Zins/Tilgung',()=>{
  const rows=F.debtSchedule({balance:10000,annualRate:6,monthlyPayment:500,startDate:'2026-08-01'});
  assert.ok(rows.length>0);
  assert.ok(rows[0].interest>0);
  assert.ok(rows[0].principal>0);
  assert.ok(rows.at(-1).balance<0.01);
  assert.ok(rows.length<30);
});

test('Safe-to-Spend und Tagesbudget berücksichtigen geplante Zahlungen und Zweckbindung',()=>{
  assert.equal(F.safeToSpend({liquid:3000,plannedIncome:500,plannedExpense:1200,earmarked:800}),1500);
  assert.equal(F.dailyBudget({safe:1500,days:15}),100);
});

test('Kündigungsfrist wird vom Vertragsende zurückgerechnet',()=>{
  assert.equal(F.cancellationDeadline('2026-12-31',90),'2026-10-02');
});
