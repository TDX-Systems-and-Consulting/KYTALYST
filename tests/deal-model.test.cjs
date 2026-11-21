const {test}=require('node:test');const assert=require('node:assert/strict');
const M=require('../deal-model.js');const budget=require('../rehab-budget.js');const BuyBox=require('../buy-box.js');
const close=(a,b)=>assert.ok(Math.abs(a-b)<=0.01,`${a} != ${b}`);
test('10.25% resale split is commissions 6 + concessions 3 + seller closing 1.25',()=>{
  assert.equal(M.defaults.commissionPct+M.defaults.concessionsPct+M.defaults.sellerClosingPct,10.25);
});
test('hard money deal matches a hand calculation line by line',()=>{
  const d=M.evaluate({purchasePrice:160000,arv:255000,rehab:30000});
  close(d.commissions,15300);close(d.concessions,7650);close(d.sellerClosing,3187.5);close(d.sellingCosts,26137.5);
  close(d.buyClosing,5600);close(d.loanAmount,174000);close(d.points,3480);close(d.interest,10440);
  close(d.holdingCost,3000);close(d.totalCost,238657.5);close(d.projectedProfit,16342.5);
  close(d.cashNeeded,38520);close(d.mao,163462.5/1.107);assert.equal(d.isDeal,false);
});
test('buying at the maximum offer lands exactly on the target profit (hard money and cash)',()=>{
  for(const assumptions of [{},{financing:'cash'},{holdMonths:9,interestRatePct:10,pointsPct:3,targetProfit:45000}]){
    const d=M.evaluate({purchasePrice:150000,arv:300000,rehab:42000,assumptions});
    const at=M.evaluate({purchasePrice:d.mao,arv:300000,rehab:42000,assumptions});
    assert.ok(Math.abs(at.projectedProfit-at.assumptions.targetProfit)<=0.02);
  }
});
test('all-cash with no holding reproduces the original 10.25% / 3.5% model',()=>{
  const d=budget.evaluate({listPrice:160000,arv:255000,rehabTotal:30000,assumptions:{financing:'cash',monthlyHolding:0}});
  close(d.projectedProfit,33262.5);close(d.financingCost,0);
});
test('daily-feed rehab headroom is the rehab that hits the target exactly',()=>{
  const r=M.maxRehab({purchasePrice:120000,arv:260000});
  const d=M.evaluate({purchasePrice:120000,arv:260000,rehab:r});
  assert.ok(d.projectedProfit>=30000&&d.projectedProfit<30000+2);
  assert.equal(BuyBox.screening(120000,260000).headroomBeforeCap,r);
});
test('bad assumptions are rejected with a readable message',()=>{
  for(const bad of [{interestRatePct:-1},{loanToPurchasePct:120},{holdMonths:''},{commissionPct:'abc'}])
    assert.throws(()=>M.normalize(bad),/must|required/);
  assert.equal(M.normalize({financing:'anything'}).financing,'hardMoney');
});
