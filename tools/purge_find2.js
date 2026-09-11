const fs=require('fs'); const html=fs.readFileSync(require('path').resolve(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('function coreFactory(){'), html.indexOf('const CORE=coreFactory();'));
const CORE=(new Function(src+'; return coreFactory();'))();
const b=CORE.buildBoard(CORE.BOARD_DEFS[0]); const cell=i=>`(${b.cells[i].r},${b.cells[i].c})`;
function find2(pkg){ const res=[]; const cells=b.cells.map(c=>c.r+','+c.c).filter(k=>!pkg.includes(k));
  for(let i=0;i<cells.length;i++) for(let j=i+1;j<cells.length;j++){ const cats=[cells[i],cells[j]];
    const st=new Array(b.n).fill(0); pkg.forEach(k=>st[b.index[k]]=1); cats.forEach(k=>st[b.index[k]]=1);
    const goal=st.slice(); pkg.forEach(k=>goal[b.index[k]]=0); const gk=goal.join(''); const path=[]; let sol=null;
    (function dfs(s,d){ if(sol) return; if(d===pkg.length){ if(s.join('')===gk) sol=path.slice(); return; } for(const m of b.moves){ if(s[m.from]&&s[m.over]&&!s[m.to]){ s[m.from]=0;s[m.over]=0;s[m.to]=1; path.push(m); dfs(s,d+1); path.pop(); s[m.from]=1;s[m.over]=1;s[m.to]=0; } } })(st,0);
    if(sol) res.push({cats,sol}); }
  return res; }
for(const [name,pkg] of [['Zweier',['3,2','3,3']],['Dreier-L',['2,2','2,3','3,3']],['L-Vierer',['2,2','2,3','2,4','3,2']],['L-Fünfer',['2,2','2,3','2,4','3,2','4,2']]]){
  const r=find2(pkg); console.log(`== ${name}: ${r.length} Varianten mit 2 Katalysatoren`); r.slice(0,6).forEach(x=>console.log('  Kat '+x.cats.join(' & ')+': '+x.sol.map(m=>cell(m.from)+'>'+cell(m.to)).join(' '))); }
