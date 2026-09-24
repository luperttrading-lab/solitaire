/* Teilchenflüssigkeit nach Clavet u. a. (2005): Doppel-Dichte-Relaxation
   (Druck + Nahdruck = Zusammenhalt/Oberflächenspannung) und Viskositäts-
   impulse. Einheiten: Brett-Einheiten (viewBox 840), ein Schritt = 1. */
function neueFluessigkeit(o){
  const P={N:o.N||420, h:o.h||34, rho0:o.rho0||6, k:o.k||0.02, kn:o.kn||0.12, sig:o.sig||0.25, beta:o.beta||0.05, damp:o.damp||0.012,
           x0:o.x0||60, x1:o.x1||780, y0:o.y0||60, y1:o.y1||780};
  const N=P.N, x=new Float32Array(N), y=new Float32Array(N), vx=new Float32Array(N), vy=new Float32Array(N), px=new Float32Array(N), py=new Float32Array(N);
  // Start: dichter Klumpen in der Mitte
  const seite=Math.ceil(Math.sqrt(N)), d=P.h*0.42;
  for(let i=0;i<N;i++){ x[i]=420+((i%seite)-seite/2)*d+Math.random()*.1; y[i]=420+(Math.floor(i/seite)-seite/2)*d+Math.random()*.1; }
  // Gitter fuer Nachbarn
  const C=P.h, GW=Math.ceil(840/C)+1, kopf=new Int32Array(GW*GW), next=new Int32Array(N);
  const nb=new Int32Array(N*64), nbn=new Int32Array(N), nq=new Float32Array(N*64);
  function nachbarn(){
    kopf.fill(-1);
    for(let i=0;i<N;i++){ const c=Math.max(0,Math.min(GW-1,Math.floor(x[i]/C)))+GW*Math.max(0,Math.min(GW-1,Math.floor(y[i]/C))); next[i]=kopf[c]; kopf[c]=i; }
    for(let i=0;i<N;i++){ nbn[i]=0; const cx=Math.floor(x[i]/C), cy=Math.floor(y[i]/C);
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ const gx=cx+dx, gy=cy+dy; if(gx<0||gy<0||gx>=GW||gy>=GW) continue;
        for(let j=kopf[gx+GW*gy];j>=0;j=next[j]){ if(j<=i) continue; const rx=x[j]-x[i], ry=y[j]-y[i], r2=rx*rx+ry*ry; if(r2>=P.h*P.h||r2<1e-6) continue;
          if(nbn[i]<64){ nb[i*64+nbn[i]]=j; nq[i*64+nbn[i]]=Math.sqrt(r2)/P.h; nbn[i]++; } } } }
  }
  function schritt(gx,gy,dt){
    for(let i=0;i<N;i++){ vx[i]+=gx*dt; vy[i]+=gy*dt; }
    nachbarn();
    // Viskositaet (zaeh)
    for(let i=0;i<N;i++) for(let k=0;k<nbn[i];k++){ const j=nb[i*64+k], q=nq[i*64+k]; const r=q*P.h, nx=(x[j]-x[i])/r, ny=(y[j]-y[i])/r;
      const u=(vx[i]-vx[j])*nx+(vy[i]-vy[j])*ny; if(u>0){ const I=dt*(1-q)*(P.sig*u+P.beta*u*u)*0.5; vx[i]-=I*nx; vy[i]-=I*ny; vx[j]+=I*nx; vy[j]+=I*ny; } }
    for(let i=0;i<N;i++){ vx[i]*=1-P.damp; vy[i]*=1-P.damp; px[i]=x[i]; py[i]=y[i]; x[i]+=vx[i]*dt; y[i]+=vy[i]*dt; }
    nachbarn();
    // Doppel-Dichte-Relaxation
    const rho=new Float32Array(N), rhon=new Float32Array(N);
    for(let i=0;i<N;i++) for(let k=0;k<nbn[i];k++){ const j=nb[i*64+k], q=nq[i*64+k], a=1-q, a2=a*a, a3=a2*a; rho[i]+=a2; rho[j]+=a2; rhon[i]+=a3; rhon[j]+=a3; }
    for(let i=0;i<N;i++) for(let k=0;k<nbn[i];k++){ const j=nb[i*64+k], q=nq[i*64+k], a=1-q; const r=q*P.h, nx=(x[j]-x[i])/r, ny=(y[j]-y[i])/r;
      const Pi=P.k*(rho[i]+rho[j]-2*P.rho0)*0.5, Pn=P.kn*(rhon[i]+rhon[j])*0.5; const D=dt*dt*(Pi*a+Pn*a*a)*0.5;
      x[i]-=D*nx; y[i]-=D*ny; x[j]+=D*nx; y[j]+=D*ny; }
    // Waende
    for(let i=0;i<N;i++){
      if(x[i]<P.x0){ x[i]=P.x0+(P.x0-x[i])*0.1; } else if(x[i]>P.x1){ x[i]=P.x1-(x[i]-P.x1)*0.1; }
      if(y[i]<P.y0){ y[i]=P.y0+(P.y0-y[i])*0.1; } else if(y[i]>P.y1){ y[i]=P.y1-(y[i]-P.y1)*0.1; }
      vx[i]=(x[i]-px[i])/dt; vy[i]=(y[i]-py[i])/dt; }
    return {rho};
  }
  return {P,N,x,y,vx,vy,schritt};
}
if(typeof module!=='undefined') module.exports={neueFluessigkeit};
