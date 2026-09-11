const fs=require('fs'); const html=fs.readFileSync(require('path').resolve(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('function coreFactory(){'), html.indexOf('const CORE=coreFactory();'));
const CORE=(new Function(src+'; return coreFactory();'))();
const b=CORE.buildBoard(CORE.BOARD_DEFS[0]); const cell=i=>`(${b.cells[i].r},${b.cells[i].c})`;
function findPurge(pkg, cat){ // Züge, die genau das Paket entfernen und den Katalysator zurücklassen
  const st=new Array(b.n).fill(0); pkg.forEach(k=>st[b.index[k]]=1); const ci=b.index[cat]; if(ci===undefined||st[ci]) return null; st[ci]=1;
  const goal=new Array(b.n).fill(0); goal[ci]=1; const goalKey=goal.join('');
  const sols=[]; const path=[];
  function dfs(s,depth){ if(depth===pkg.length){ if(s.join('')===goalKey) sols.push(path.slice()); return; }
    for(const m of b.moves){ if(s[m.from]&&s[m.over]&&!s[m.to]){ s[m.from]=0; s[m.over]=0; s[m.to]=1; path.push(m); dfs(s,depth+1); path.pop(); s[m.from]=1; s[m.over]=1; s[m.to]=0; } } }
  dfs(st,0); return sols;
}
function show(name,pkg){ console.log('== '+name+' Paket '+pkg.join(' '));
  let found=0; for(const c of b.cells){ const k=c.r+','+c.c; if(pkg.includes(k)) continue; const sols=findPurge(pkg,k); if(sols&&sols.length){ found++; console.log('  Katalysator '+k+': '+sols.length+' Lösung(en), z.B. '+sols[0].map(m=>cell(m.from)+'>'+cell(m.to)).join(' ')); } }
  if(!found) console.log('  keine'); }
show('Dreier-Reihe',['3,2','3,3','3,4']);
show('Dreier-L',['2,2','2,3','3,3']);
show('Sechser 2x3',['0,2','0,3','0,4','1,2','1,3','1,4']);
show('Sechser 2x3 mittig',['2,2','2,3','2,4','3,2','3,3','3,4']);
show('L-Fünfer',['1,2','1,3','1,4','2,2','3,2']);
show('L-Vierer',['2,2','2,3','2,4','3,2']);
show('Neuner 3x3',['2,2','2,3','2,4','3,2','3,3','3,4','4,2','4,3','4,4']);
