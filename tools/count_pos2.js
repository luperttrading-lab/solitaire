const fs=require('fs'); const html=fs.readFileSync(require('path').resolve(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('function coreFactory(){'), html.indexOf('const CORE=coreFactory();'));
const CORE=(new Function(src+'; return coreFactory();'))();
const b=CORE.buildBoard(CORE.BOARD_DEFS[0]); const solver=CORE.createSolver(b);
const M=b.moves.length; const fmL=[],omL=[],tmL=[],fmH=[],omH=[],tmH=[];
b.moves.forEach(m=>{ const bit=i=>i<32?[1<<i,0]:[0,1<<(i-32)]; let x=bit(m.from); fmL.push(x[0]); fmH.push(x[1]); x=bit(m.over); omL.push(x[0]); omH.push(x[1]); x=bit(m.to); tmL.push(x[0]); tmH.push(x[1]); });
function uniqSorted(arr){ arr.sort(); let w=0; for(let i=0;i<arr.length;i++){ if(i===0||arr[i]!==arr[i-1]) arr[w++]=arr[i]; } return arr.subarray(0,w); }
function countFrom(name, emptyKeys){
  const st=new Array(b.n).fill(1); emptyKeys.forEach(k=>st[b.index[k]]=0);
  const [lo0,hi0]=CORE.fromArray(st); const n=st.reduce((a,v)=>a+v,0);
  let level=Float64Array.from([CORE.key(lo0,hi0)]); let totalRaw=1, totalCanon=1, maxLevel=1; const t0=Date.now();
  for(let d=1; d<n; d++){
    let out=new Float64Array(Math.max(1024,level.length*10)); let w=0;
    for(let i=0;i<level.length;i++){ const k=level[i]; const lo=(k%4294967296)|0, hi=Math.floor(k/4294967296)|0;
      for(let m=0;m<M;m++){ if(((lo&fmL[m])|(hi&fmH[m]))&&((lo&omL[m])|(hi&omH[m]))&&!((lo&tmL[m])|(hi&tmH[m]))){
        if(w>=out.length){ const o2=new Float64Array(out.length*2); o2.set(out); out=o2; }
        out[w++]=CORE.key(lo^fmL[m]^omL[m]^tmL[m], hi^fmH[m]^omH[m]^tmH[m]); } } }
    if(!w) break;
    level=uniqSorted(out.subarray(0,w)); 
    const can=new Float64Array(level.length); for(let i=0;i<level.length;i++){ const k=level[i]; can[i]=solver.canon((k%4294967296)|0, Math.floor(k/4294967296)|0); }
    const cu=uniqSorted(can);
    totalRaw+=level.length; totalCanon+=cu.length; if(level.length>maxLevel) maxLevel=level.length;
    process.stdout.write(`  ${name} Ebene ${d}: ${level.length} roh / ${cu.length} kanonisch (${((Date.now()-t0)/1000).toFixed(0)} s)\n`);
  }
  console.log(`${name}: ${n} Steine -> erreichbare Stellungen: ${totalRaw.toLocaleString('de-DE')} (ohne Symmetrie), ${totalCanon.toLocaleString('de-DE')} (Spiegelungen/Drehungen zusammengefasst), größte Ebene ${maxLevel.toLocaleString('de-DE')}, ${((Date.now()-t0)/1000).toFixed(0)} s`);
}
countFrom('17:03', ['1,4','3,2','3,5','4,3','4,4','5,3']);
countFrom('16:47', ['2,3','2,5','3,4','4,3','4,4','5,3']);
countFrom('Start', ['3,3']);
