const C=require('./core.js');
const boards={}; for(const d of C.BOARD_DEFS) boards[d.id]=C.buildBoard(d);
// 3-colouring invariant for orthogonal jumps: f=(r-c) mod 3, g=(r+c) mod 3. Each jump flips parity of all three class counts.
for(const id of ['diamond','european','wiegleb','english','square5','plus21']){
  const b=boards[id]; const seen=new Set(); let line=id+':';
  for(let v=0;v<b.n;v++){
    const canon=Math.min(...b.syms.map(p=>p[v])); if(seen.has(canon)) continue; seen.add(canon);
    const cnt=(fn)=>{ const n=[0,0,0]; b.cells.forEach((x,i)=>{ if(i!==v) n[((fn(x)%3)+3)%3]++; }); return n; };
    const nf=cnt(x=>x.r-x.c), ng=cnt(x=>x.r+x.c);
    const par=(n)=>[(n[0]+n[1])%2,(n[1]+n[2])%2];
    const pf=par(nf), pg=par(ng);
    const okf = !(pf[0]===0&&pf[1]===0), okg=!(pg[0]===0&&pg[1]===0);
    line+=` (${b.cells[v].r},${b.cells[v].c})=${okf&&okg?'möglich':'UNMÖGLICH'}`;
  }
  console.log(line);
}
