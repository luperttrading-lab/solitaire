const fs=require('fs');
const html=fs.readFileSync(require('path').resolve(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('function coreFactory(){'), html.indexOf('const CORE=coreFactory();'));
const CORE=(new Function(src+'; return coreFactory();'))();
const book={};
for(const def of CORE.BOARD_DEFS){
  const b=CORE.buildBoard(def); const st=new Array(b.n).fill(1); st[b.startIdx]=0; const [lo,hi]=CORE.fromArray(st);
  let r=null; for(const seed of [7,11,13,17,19]){ r=CORE.solveSmart(b,lo,hi,b.n-1,{maxNodes:3e7,timeMs:240000,perRestart:250000,seed}); if(r.best===1) break; }
  let s=st.slice(), okp=true; for(const mi of r.path){ const m=b.moves[mi]; if(!(s[m.from]&&s[m.over]&&!s[m.to])){okp=false;break;} s[m.from]=0; s[m.over]=0; s[m.to]=1; }
  const left=s.reduce((a,v)=>a+v,0);
  console.log(`${def.id}: best=${r.best} complete=${r.complete} nodes=${r.nodes} len=${r.path.length} replayOK=${okp} left=${left}`);
  if(r.best===1&&okp&&left===1) book[def.id]=r.path;
}
fs.writeFileSync('book.json',JSON.stringify(book)); console.log(Object.keys(book).join(','));
