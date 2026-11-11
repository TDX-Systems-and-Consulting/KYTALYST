const { test } = require('node:test');
const assert = require('node:assert/strict');
const budget = require('../rehab-budget.js');

const item = overrides => ({ description: 'LVP flooring', trade: 'Flooring', unit: 'sq ft',
  qty: 125.5, material: 2.35, labor: 1.75, other: 0.2, ...overrides });

test('quantity multiplies all unit costs; contingency is added once', () => {
  const b = budget.calculate([item(), item({ description: 'Permit', qty: 1, material: 0, labor: 0, other: 300 })], 12.5);
  assert.equal(b.lines[0].total, 539.65);
  assert.equal(b.subtotal, 839.65);
  assert.equal(b.contingency, 104.96);
  assert.equal(b.total, 944.61);
});
test('catalog bundled pricing is not split or counted twice', () => {
  const b = budget.calculate([item({qty: 2, material: 0, labor: 0, other: 274.82, source: 'JOBSpan'})], 0);
  assert.equal(b.total, 549.64);
  assert.equal(b.lines[0].source, 'JOBSpan');
});
test('empty drafts and explicit zero-cost scopes calculate without invented costs', () => {
  assert.equal(budget.calculate([], 10).total, 0);
  assert.equal(budget.calculate([item({material:0,labor:0,other:0})], 25).total, 0);
});
test('invalid descriptions, quantities, costs and contingency are rejected', () => {
  for (const change of [{description:''}, {qty:0}, {qty:-1}, {qty:''}, {material:-1},
    {labor:Infinity}, {other:'NaN'}, {other:''}, {qty:1e300}]) {
    assert.throws(() => budget.calculate([item(change)], 10));
  }
  for (const percent of [-1,101,'',Infinity]) assert.throws(() => budget.calculate([item()], percent));
});
test('profit uses manual rehab and maximum offer meets target after closing costs', () => {
  const d = budget.evaluate({listPrice:160000,arv:255000,rehabTotal:30000,wantedProfit:20000});
  assert.equal(d.projectedProfit, 33262.5);
  assert.equal(d.isDeal, true);
  const atOffer = budget.evaluate({listPrice:d.mao,arv:255000,rehabTotal:30000,wantedProfit:20000});
  assert.ok(Math.abs(atOffer.projectedProfit - 20000) <= 0.01);
  const higherRehab = budget.evaluate({listPrice:160000,arv:255000,rehabTotal:50000});
  assert.equal(higherRehab.projectedProfit, d.projectedProfit - 20000);
  assert.equal(higherRehab.isDeal, false);
});
test('invalid purchase values prevent a deal verdict', () => {
  for(const change of [{listPrice:0},{arv:0},{arv:Infinity},{rehabTotal:-1},{wantedProfit:-1}]) {
    assert.throws(() => budget.evaluate({listPrice:160000,arv:255000,rehabTotal:30000,...change}));
  }
});
test('saved budgets are validated and isolated by normalized property address', () => {
  assert.equal(budget.key('  123 Main St,  MO '),budget.key('123 main st, mo'));
  assert.notEqual(budget.key('123 Main St'),budget.key('124 Main St'));
  const restored = budget.restore({version:1,items:[item()],contingencyPercent:10,applied:true});
  assert.equal(restored.applied,true);
  assert.equal(budget.restore({version:1,items:[],contingencyPercent:10,applied:true}).applied,false);
  assert.throws(() => budget.restore({version:1,items:[item({qty:-1})],contingencyPercent:10}));
  assert.throws(() => budget.restore({version:2,items:[]}));
});
