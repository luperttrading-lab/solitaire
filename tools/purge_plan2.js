const fs=require('fs'); const html=fs.readFileSync(require('path').resolve(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('function coreFactory(){'), html.indexOf('const CORE=coreFactory();'));
const CORE=(new Function(src+'; return coreFactory();'))();
const b=CORE.buildBoard(CORE.BOARD_DEFS[0]); const cell=i=>`(${b.cells[i].r},${b.cells[i].c})`;
const P=k=>k.split(',').map(Number);
const PATTERNS=JSON.parse(fs.readFileSync(require('path').resolve(__dirname,'patterns.json'),'utf8'));
const T=[(r,c)=>[r,c],(r,c)=>[6-r,c],(r,c)=>[r,6-c],(r,c)=>[6-r,6-c],(r,c)=>[c,r],(r,c)=>[6-c,r],(r,c)=>[c,6-r],(r,c)=>[6-c,6-r]];
const inst=[]; const seen=new Set();
for(const pat of PATTERNS) for(const t of T) for(let dr=-6;dr<=6;dr++) for(let dc=-6;dc<=6;dc++){
  const map=k=>{ const [r,c]=t(...P(k)); return b.index[(r+dr)+','+(c+dc)]; };
  const pkg=pat.pkg.map(map), cat=map(pat.cat), mv=pat.moves.map(([f,to])=>[map(f),map(to)]);
  if([...pkg,cat,...mv.flat()].some(v=>v===undefined)) continue;
  const moves=mv.map(([f,to])=>b.moves.find(m=>m.from===f&&m.to===to)); if(moves.some(m=>!m)) continue;
  const sig=pat.name+'|'+pkg.slice().sort().join('.')+'|'+cat+'|'+moves.map(m=>b.moves.indexOf(m)).join('.'); if(seen.has(sig)) continue; seen.add(sig);
  inst.push({name:pat.name,pkg,cat,moves});
}
console.log('Purge-Instanzen:',inst.length);
function applyPurge(s,p){ const c=s.slice(); for(const m of p.moves){ if(!(c[m.from]&&c[m.over]&&!c[m.to])) return null; c[m.from]=0; c[m.over]=0; c[m.to]=1; } for(let i=0;i<b.n;i++){ const exp=p.pkg.includes(i)?0:s[i]; if(c[i]!==exp) return null; } return c; }
function finishable(s){ const n=s.reduce((a,v)=>a+v,0); const [lo,hi]=CORE.fromArray(s); const r=CORE.solveSmart(b,lo,hi,n,{maxNodes:3e6,timeMs:20000,target:1}); return r.best===1?r.path.map(i=>b.moves[i]):null; }
const start=new Array(b.n).fill(1); start[b.startIdx]=0;
let best=null, nodes=0; const visited=new Set();
function dfs(s,phases,openLeft,purgeDone,maxEnd){
  nodes++; if(nodes>2e6) return false;
  const n=s.reduce((a,v)=>a+v,0); const key=s.join('')+'|'+openLeft; if(visited.has(key)) return false; visited.add(key);
  if(n<=maxEnd){ const fin=finishable(s); if(fin){ if(fin.length) phases.push({type:'Endspiel',moves:fin}); best=phases.slice(); return true; } }
  for(const p of inst){ const c=applyPurge(s,p); if(c){ phases.push({type:p.name,moves:p.moves,pkg:p.pkg,cat:p.cat}); if(dfs(c,phases,openLeft,true,maxEnd)) return true; phases.pop(); } }
  if(openLeft>0&&!purgeDone) for(const m of b.moves){ if(s[m.from]&&s[m.over]&&!s[m.to]){ const c=s.slice(); c[m.from]=0; c[m.over]=0; c[m.to]=1; phases.push({type:'Einzelzug',moves:[m]}); if(dfs(c,phases,openLeft-1,false,maxEnd)) return true; phases.pop(); } }
  return false;
}
outer: for(const maxEnd of [7,9,11]) for(const open of [1,2,3,4]){ visited.clear(); nodes=0; best=null; const t0=Date.now(); const ok=dfs(start,[],open,false,maxEnd);
  console.log(`Endspiel ab ${maxEnd} Steinen, Eröffnung ${open}: ${ok?'LÖSUNG':'keine'} (${nodes} Knoten, ${((Date.now()-t0)/1000).toFixed(1)} s)`);
  if(ok){ best.forEach((ph,i)=>console.log(`  ${i+1}. ${ph.type}${ph.cat!==undefined?' Kat '+cell(ph.cat):''}: `+ph.moves.map(m=>cell(m.from)+'>'+cell(m.to)).join(' ')));
    fs.writeFileSync('plan.json',JSON.stringify(best.map(ph=>({type:ph.type,moves:ph.moves.map(m=>b.moves.indexOf(m)),pkg:ph.pkg||[],cat:ph.cat})))); break outer; } }
