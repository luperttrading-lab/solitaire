const {neueFluessigkeit}=require('./sim.js');
function lauf(opt,label,a){
  const f=neueFluessigkeit(Object.assign({N:1300,h:34,rho0:5.5,k:0.02,kn:0.12,x0:72,x1:768,y0:72,y1:768},opt));
  const R0=34*0.42*Math.sqrt(1300/Math.PI); for(let i=0;i<f.N;i++){const r=R0*Math.sqrt((i+.5)/f.N),t=i*2.39996;f.x[i]=420+r*Math.cos(t);f.y[i]=420+r*Math.sin(t);}
  const klumpen=()=>{ const par=[...Array(f.N).keys()]; const fd=q=>par[q]===q?q:(par[q]=fd(par[q]));
    for(let i=0;i<f.N;i++) for(let j=i+1;j<f.N;j++){ const dx=f.x[i]-f.x[j], dy=f.y[i]-f.y[j]; if(dx*dx+dy*dy<900) par[fd(i)]=fd(j); }
    const g={}; for(let i=0;i<f.N;i++){const r=fd(i); g[r]=(g[r]||0)+1;} return Object.values(g).filter(v=>v>=10).length; };
  const plan=[[a,0,90],[-a,a,60],[a,-a,60],[-a,-a,60],[0,0,180]]; const aus=[]; let maxK=0;
  for(const [gx,gy,n] of plan){ for(let k=0;k<n;k++){ f.schritt(gx,gy,1); if(k%15===0){ const K=klumpen(); maxK=Math.max(maxK,K);} } aus.push(klumpen()); }
  console.log(label.padEnd(26),'Klumpen am Ende jeder Phase:',aus.join(' → '),' höchstens',maxK);
}
for(const a of [0.076,0.18]){
  console.log('Neigungskraft',a);
  lauf({sig:0.3,beta:0.05,damp:0.014},'  zäh (jetzt)',a);
  lauf({sig:0.1,beta:0.02,damp:0.006},'  flüssiger',a);
  lauf({sig:0.05,beta:0.01,damp:0.003,kn:0.08},'  noch flüssiger',a);
}
