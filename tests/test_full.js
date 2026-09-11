const fs=require('fs'); const html=fs.readFileSync(require('path').resolve(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('function coreFactory(){'), html.indexOf('const CORE=coreFactory();'));
const CORE=(new Function(src+'; return coreFactory();'))();
const b=CORE.buildBoard(CORE.BOARD_DEFS[0]); let fails=0;
function bfsEverEmpty(st){ // unabhängig: rohe BFS, Vereinigung aller leeren Felder
  const n=b.n; let level=new Set([st.join('')]); const ever=new Array(n).fill(false); st.forEach((v,i)=>{ if(!v) ever[i]=true; }); let total=1;
  while(level.size){ const next=new Set(); for(const k of level){ const s=[...k].map(Number); for(const m of b.moves){ if(s[m.from]&&s[m.over]&&!s[m.to]){ const c=s.slice(); c[m.from]=0; c[m.over]=0; c[m.to]=1; const ck=c.join(''); if(!next.has(ck)){ next.add(ck); c.forEach((v,i)=>{ if(!v) ever[i]=true; }); } } } } total+=next.size; level=next; }
  return {ever,total};
}
let seed=3; const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; };
for(let trial=0;trial<5;trial++){
  let st=new Array(b.n).fill(1); st[b.startIdx]=0; const target=14+trial*2;
  while(st.reduce((a,v)=>a+v,0)>target){ const mv=b.moves.filter(m=>st[m.from]&&st[m.over]&&!st[m.to]); if(!mv.length) break; const m=mv[Math.floor(rnd()*mv.length)]; st[m.from]=0; st[m.over]=0; st[m.to]=1; }
  const n=st.reduce((a,v)=>a+v,0); const [lo,hi]=CORE.fromArray(st);
  const ref=bfsEverEmpty(st);
  const s=CORE.createSearch(b,lo,hi,n,{maxNodes:0,target:1,full:true}); let r; do{ r=s.run(1e6); }while(!r.done);
  const got=[]; for(let i=0;i<b.n;i++) got.push(i<32?!!((r.everEmpty[0]>>>i)&1):!!((r.everEmpty[1]>>>(i-32))&1));
  const same=got.every((v,i)=>v===ref.ever[i]); if(!same) fails++;
  const stranded=st.map((v,i)=>v&&!ref.ever[i]?i:-1).filter(i=>i>=0).map(i=>`(${b.cells[i].r},${b.cells[i].c})`);
  console.log(`${n} Steine: rohe Stellungen=${ref.total} Suche=${r.nodes} everEmpty ${same?'identisch':'ABWEICHUNG'}; gestrandet: ${stranded.join(' ')||'keiner'}; min=${r.best}`);
}
// Konstruierte Stellung: (0,2) allein oben, Cluster in Reihe 3 -> (0,2) muss gestrandet sein
{ const st=new Array(b.n).fill(0); ['0,2','3,2','3,3','3,4'].forEach(k=>st[b.index[k]]=1); const [lo,hi]=CORE.fromArray(st);
  const s=CORE.createSearch(b,lo,hi,4,{maxNodes:0,target:1,full:true}); let r; do{ r=s.run(1e6); }while(!r.done);
  const i02=b.index['0,2']; const never=!((r.everEmpty[0]>>>i02)&1); console.log('Konstruiert: (0,2) gestrandet =',never,'min=',r.best); if(!never||r.best!==3) fails++; }
console.log(fails?`\n${fails} FEHLER`:'\nVOLL-SUCHE OK'); process.exitCode=fails?1:0;
