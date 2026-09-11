const fs=require('fs'); const html=fs.readFileSync(require('path').resolve(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('function coreFactory(){'), html.indexOf('const CORE=coreFactory();'));
const CORE=(new Function(src+'; return coreFactory();'))();
const b=CORE.buildBoard(CORE.BOARD_DEFS[0]);
function pos(keys){ const st=new Array(b.n).fill(1); keys.forEach(k=>st[b.index[k]]=0); const [lo,hi]=CORE.fromArray(st); return {st,lo,hi,n:st.reduce((a,v)=>a+v,0)}; }
let fails=0;
for(const [name,keys,expected] of [['17:03',['1,4','3,2','3,5','4,3','4,4','5,3'],5717512],['16:47',['2,3','2,5','3,4','4,3','4,4','5,3'],5965349]]){
  const p=pos(keys); let t0=Date.now();
  // Ziel 0 = unerreichbar => vollständige Absuche; Zahl muss exakt der unabhängigen BFS-Zählung entsprechen
  const s=CORE.createSearch(b,p.lo,p.hi,p.n,{maxNodes:0,target:0,seed:1}); let r; do{ r=s.run(1e6); }while(!r.done);
  const exact=(r.nodes-600004)===expected; // 600.000 Stellungen Neustartphase + 4 Wurzelbesuche if(!exact) fails++;
  console.log(`${name} vollständig: Stellungen=${r.nodes.toLocaleString('de-DE')} erwartet=${expected.toLocaleString('de-DE')} min=${r.best} complete=${r.complete} ${((Date.now()-t0)/1000).toFixed(1)} s ${exact?'OK exakt':'FEHLER'}`);
  t0=Date.now(); const s2=CORE.createSearch(b,p.lo,p.hi,p.n,{maxNodes:0,target:1,seed:1}); let r2; do{ r2=s2.run(1e6); }while(!r2.done);
  console.log(`  ohne Limit (Ziel 1): best=${r2.best} complete=${r2.complete} Stellungen=${r2.nodes.toLocaleString('de-DE')} ${((Date.now()-t0)/1000).toFixed(1)} s`);
  for(const mio of [1,5]){ t0=Date.now(); const s3=CORE.createSearch(b,p.lo,p.hi,p.n,{maxNodes:mio*1e6,target:1,seed:1}); let r3; do{ r3=s3.run(1e6); }while(!r3.done);
    console.log(`  ${mio} Mio: best=${r3.best} complete=${r3.complete} Stellungen=${r3.nodes.toLocaleString('de-DE')} ${((Date.now()-t0)/1000).toFixed(1)} s`); }
}
// Stellung, aus der 1 unmöglich ist, Parität lässt 1 zu -> muss jetzt bewiesen enden
{ let seed=5; const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; }; let found=0;
  for(let trial=0;trial<60&&found<2;trial++){ let st=new Array(b.n).fill(1); st[b.startIdx]=0;
    for(let k=0;k<6;k++){ const mv=b.moves.filter(m=>st[m.from]&&st[m.over]&&!st[m.to]); const m=mv[Math.floor(rnd()*mv.length)]; st[m.from]=0; st[m.over]=0; st[m.to]=1; }
    const [lo,hi]=CORE.fromArray(st); const lb=CORE.parityLowerBound(b,st); if(lb>1) continue;
    const t0=Date.now(); const s=CORE.createSearch(b,lo,hi,26,{maxNodes:0,target:1,seed:1}); let r; do{ r=s.run(1e6); }while(!r.done);
    if(r.best>1){ found++; console.log(`Zufallsstellung ${trial} (26 Steine): 1 unmöglich – bewiesen min=${r.best} complete=${r.complete} Stellungen=${r.nodes.toLocaleString('de-DE')} ${((Date.now()-t0)/1000).toFixed(1)} s`); if(!r.complete) fails++; } } }
console.log(fails?`\n${fails} FEHLER`:'\nTABELLEN-TESTS OK');
