const {neueFluessigkeit}=require('./sim.js');
function lauf(opt,label){
  const f=neueFluessigkeit(opt); const G=opt.G||0.08;
  const bericht=(t,gx,gy)=>{ let mx=0,my=0,sp=0; for(let i=0;i<f.N;i++){mx+=f.x[i];my+=f.y[i];sp=Math.max(sp,Math.hypot(f.vx[i],f.vy[i]));} mx/=f.N;my/=f.N;
    // Flaeche: belegte 20er-Zellen
    const s=new Set(); for(let i=0;i<f.N;i++) s.add(Math.floor(f.x[i]/20)+'_'+Math.floor(f.y[i]/20));
    // Klumpen zaehlen (Verbindung < h)
    const par=[...Array(f.N).keys()]; const fd=a=>par[a]===a?a:(par[a]=fd(par[a]));
    for(let i=0;i<f.N;i++) for(let j=i+1;j<f.N;j++){ if((f.x[i]-f.x[j])**2+(f.y[i]-f.y[j])**2<(f.P.h*0.9)**2) par[fd(i)]=fd(j); }
    const gr={}; for(let i=0;i<f.N;i++){const r=fd(i); gr[r]=(gr[r]||0)+1;} const gross=Object.values(gr).filter(n=>n>=8).length;
    return `t=${t} g=(${gx},${gy}) Mitte ${mx.toFixed(0)},${my.toFixed(0)} Flaeche ${(s.size*400/ (720*720)*100).toFixed(0)}% max v ${sp.toFixed(2)} Klumpen ${gross}`; };
  const ablauf=[[0,0,120],[G,0,240],[-G,G,240],[G,-G,120],[0,0,240]];
  let t=0; console.log('--- '+label);
  for(const [gx,gy,n] of ablauf){ for(let k=0;k<n;k++){ f.schritt(gx,gy,1); t++; } console.log(bericht(t,gx,gy)); if(!isFinite(f.x[0])){console.log('EXPLODIERT');break;} }
}
lauf({N:420},'Grund');
lauf({N:420,k:0.04,kn:0.2},'steifer');
lauf({N:600,rho0:5},'mehr, lockerer');
