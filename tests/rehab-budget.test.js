const {test}=require('node:test');
const assert=require('node:assert/strict');
const budget=require('../rehab-budget.js');
test('Hipshot shows exactly minus and plus 10 percent',()=>{
  assert.deepEqual(budget.hipshot(30000),{amount:30000,low:27000,high:33000});
  assert.deepEqual(budget.hipshot('12500.55'),{amount:12500.55,low:11250.5,high:13750.61});
  assert.deepEqual(budget.hipshot(0),{amount:0,low:0,high:0});
});
test('invalid Hipshots cannot produce a verdict',()=>{
  for(const n of ['',null,undefined,-1,Infinity,'NaN',true,1e300]) assert.throws(()=>budget.hipshot(n));
});
test('profit uses entered amount without adding the 10 percent range',()=>{
  const d=budget.evaluate({listPrice:160000,arv:255000,rehabTotal:budget.hipshot(30000).amount});
  assert.equal(d.projectedProfit,33262.5);
  const atOffer=budget.evaluate({listPrice:d.mao,arv:255000,rehabTotal:30000});
  assert.ok(Math.abs(atOffer.projectedProfit-20000)<=0.01);
});
test('missing price or ARV cannot produce a verdict',()=>{
  for(const change of [{listPrice:0},{arv:0},{arv:Infinity},{rehabTotal:-1}]) {
    assert.throws(()=>budget.evaluate({listPrice:160000,arv:255000,rehabTotal:30000,...change}));
  }
});
test('Hipshots persist per property without overwriting legacy detailed budgets',()=>{
  assert.equal(budget.key('  123 Main St '),budget.key('123 main st'));
  assert.notEqual(budget.key('123 Main St'),budget.key('124 Main St'));
  assert.match(budget.key('123 Main St'),/^kytalyst-hipshot-v2:/);
  assert.deepEqual(budget.restore({version:2,amount:30000}),{amount:30000});
  assert.deepEqual(budget.restore({version:2,amount:''}),{amount:''});
  assert.throws(()=>budget.restore({version:2,amount:-1}));
  assert.throws(()=>budget.restore({version:1,items:[]}));
});
