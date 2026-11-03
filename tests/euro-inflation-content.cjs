// Run from the repository root: node tests/euro-inflation-content.cjs [baseline-script]
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
function api(file) {
  const context = { window: {}, document: { readyState: 'loading', addEventListener() {} } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
  return context.window.OldNewCalculator;
}
const c = api('assets/js/old-new-calculator.js');
const raw = JSON.parse(fs.readFileSync('assets/data/old-new.json')), d = c.prepare(raw), end = d.months.at(-1).key;
const close = (a, b) => assert.ok(Math.abs(a-b) < 1e-10 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const fixture = rows => c.prepare({ assets: [{id:'a'}], cols:['month','hicp','a'], rows });
const f = fixture([['2000-01',100,100],['2000-02',200,50],['2000-03',100,100],['2001-01',150,120]]);
for (const [start, to, equivalent, rise, loss] of [
  ['2000-01','2000-02',200,1,.5], ['2000-02','2000-03',50,-.5,-1], ['2000-01','2000-01',100,0,0]
]) {
  const i = c.inflation(f, 100, start, to);
  close(i.equivalent,equivalent); close(i.rise,rise); close(i.loss,loss);
}
assert.equal(c.januaryRows(f,'2000-03').length,1);
assert.equal(c.januaryRows(f,'2001-01').length,2);
for (const real of [true,false]) {
  const fall = c.drawdown(f,'a','2000-01','2001-01',real);
  close(fall.gap, real ? -.75 : -.5);
  assert.equal(fall.from,'2000-01'); assert.equal(fall.to,'2000-02'); assert.equal(fall.recovery,'2000-03');
}
assert.equal(c.drawdown(f,'a','2000-01','2000-02',false).recovery,null);
assert.equal(c.drawdown(f,'a','2000-01','2000-01',true).from,null);
const later = fixture([['2000-01',100,100],['2000-02',100,80],['2000-03',100,150],['2000-04',100,60],['2000-05',100,100],['2000-06',100,150]]);
const deep=c.drawdown(later,'a','2000-01','2000-06',false);
close(deep.gap,-.6); assert.equal(deep.from,'2000-03'); assert.equal(deep.to,'2000-04'); assert.equal(deep.recovery,'2000-06');
const missing=fixture([['2000-01',100,null],['2000-02',100,100]]);
assert.equal(c.drawdown(missing,'a','2000-01','2000-02',false),null);
assert.equal(c.startRows(missing,'2000-01','2000-02',true)[0].values[0],null);
const jan=c.januaryRows(d,end);
assert.equal(jan.length,+end.slice(0,4)-+d.months[0].key.slice(0,4)+1);
jan.forEach(row=>{
  assert.equal(row.start.slice(5),'01');
  const h0=d.months[d.index[row.start]].hicp,h1=d.months.at(-1).hicp;
  close(row.inflation.equivalent,100*h1/h0); close(row.inflation.loss,1-h0/h1);
});
const nominal=c.startRows(d,'1999-11',end,false),real=c.startRows(d,'1999-11',end,true);
assert.equal(nominal[0].start,'1999-01');
for(const id of ['deposit','bitcoin']) assert.equal(nominal[0].values[d.assets.findIndex(a=>a.id===id)],null);
nominal.forEach((row,j)=>{
  assert.equal(row.months,d.index[end]-d.index[row.start]);
  row.values.forEach((value,i)=>{
    assert.equal(value,real[j].values[i]); // no second deflation of endpoint balances
    if(value===null)return;
    const id=d.assets[i].id,m0=d.months[d.index[row.start]],m1=d.months.at(-1);
    close(value,100*m1.levels[id]/m0.levels[id]);
    close(real[j].gains[i],value/(100*m1.hicp/m0.hicp)-1);
  });
});
if(process.argv[2]) {
  const old=api(process.argv[2]),before=old.prepare(raw);
  for(const start of ['1999-01','2000-01','2007-10','2010-07','2017-12','2020-03',end])
    for(const mode of ['lump','monthly']) for(const real of [true,false]){
      const o={start,mode,real,amount:mode==='lump'?1000:100};
      const current=c.calculate(d,o);
      assert.equal(JSON.stringify(current),JSON.stringify(old.calculate(before,o)));
      current.results.forEach(x=>close(c.drawdown(d,x.asset.id,start,end,real).gap,x.fall.gap));
    }
}
for(const start of ['1999-01','2000-01','2010-07','2017-12',end]) for(const real of [true,false]) for(const a of d.assets){
  const f=c.drawdown(d,a.id,start,end,real); if(!f||!f.from)continue;
  const price=m=>m.levels[a.id]/(real?m.hicp:1),high=price(d.months[d.index[f.from]]);
  const until=f.recovery?d.index[f.recovery]:d.index[end]+1;
  for(let i=d.index[f.to]+1;i<until;i++)assert.ok(price(d.months[i])<high);
  if(f.recovery)assert.ok(price(d.months[until])>=high);
}
console.log('PASS: inflation/deflation, January rows, common endpoint, availability, recovery dates and baseline calculator regression.');
