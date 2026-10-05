/* Baut 4-steine.webp aus Lutz' Steinblatt (v1.89).
   Aufruf: node tools/steine_bauen.js <quelle.jpg> [einzug_px]
   Quelle: 8 x 5 Murmeln auf Magenta (#FF00FF), 2576 x 1438, Radius 130-131 px.
   Jede Murmel wird an ihrer Magenta-Grenze vermessen (Schwerpunkt + Flaechenradius),
   um den Einzug verkleinert (gegen den Magentasaum) und kreisrund mit Alpha in eine
   Zelle von 192 px gelegt. Ausgabe: Sprite 1536 x 960 (8 x 5 Zellen), WebP mit Alpha.
   Dazu schreibt es die mittlere Farbe je Stein auf stdout (fuer STEINE in index.html). */
const puppeteer=require('puppeteer');const fs=require('fs');const path=require('path');
(async()=>{
  const src=process.argv[2], einzug=+(process.argv[3]||5);
  const br=await puppeteer.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const p=await br.newPage();
  const r=await p.evaluate(async(b64,einzug)=>{
    const im=new Image(); im.src='data:image/jpeg;base64,'+b64; await im.decode();
    const c=document.createElement('canvas'); c.width=im.width; c.height=im.height; const x=c.getContext('2d'); x.drawImage(im,0,0);
    const w=c.width,h=c.height,d=x.getImageData(0,0,w,h).data;
    const mag=i=>d[i]>200&&d[i+2]>200&&d[i+1]<90;
    const Z=192, o=document.createElement('canvas'); o.width=8*Z; o.height=5*Z; const ox=o.getContext('2d');
    const info=[];
    for(let r=0;r<5;r++) for(let k=0;k<8;k++){
      const gx=(k+.5)*w/8, gy=(r+.5)*h/5; let sx=0,sy=0,n=0;
      for(let y=Math.max(0,Math.round(gy-150));y<Math.min(h,gy+150);y++) for(let xx=Math.max(0,Math.round(gx-150));xx<Math.min(w,gx+150);xx++){ if(!mag((y*w+xx)*4)){ sx+=xx; sy+=y; n++; } }
      const cx=sx/n, cy=sy/n, R0=Math.sqrt(n/Math.PI), R=R0-einzug;
      ox.save(); ox.beginPath(); ox.arc(k*Z+Z/2,r*Z+Z/2,Z/2,0,2*Math.PI); ox.clip();
      ox.drawImage(c,cx-R,cy-R,2*R,2*R,k*Z,r*Z,Z,Z); ox.restore();
      // mittlere Farbe innerhalb 80 % des Radius
      let a=[0,0,0],m=0; for(let y=Math.round(cy-R*.8);y<cy+R*.8;y++) for(let xx=Math.round(cx-R*.8);xx<cx+R*.8;xx++){ if(Math.hypot(xx-cx,y-cy)>R*.8) continue; const i=(y*w+xx)*4; a[0]+=d[i]; a[1]+=d[i+1]; a[2]+=d[i+2]; m++; }
      info.push({cx:+cx.toFixed(1),cy:+cy.toFixed(1),R0:+R0.toFixed(1),hex:'#'+a.map(v=>Math.round(v/m).toString(16).padStart(2,'0')).join('')});
    }
    // Saum pruefen: Randring der Zellen (Alpha > 0) mit Magentastich
    const od=ox.getImageData(0,0,o.width,o.height).data; let saum=0,rand=0;
    for(let r=0;r<5;r++) for(let k=0;k<8;k++) for(let t=0;t<720;t++){ const a=t/720*2*Math.PI;
      for(const rr of [Z/2-1.5,Z/2-3,Z/2-5]){ const px=Math.round(k*Z+Z/2+rr*Math.cos(a)), py=Math.round(r*Z+Z/2+rr*Math.sin(a)); const i=(py*o.width+px)*4;
        if(od[i+3]<200) continue; rand++; if(od[i]-od[i+1]>50&&od[i+2]-od[i+1]>50&&od[i+2]>od[i+1]+50) saum++; } }
    return {info,saum,rand,url:o.toDataURL('image/webp',.86)};
  },fs.readFileSync(src).toString('base64'),einzug);
  const buf=Buffer.from(r.url.split(',')[1],'base64');
  fs.writeFileSync(path.join(__dirname,'..','4-steine.webp'),buf);
  console.log('Einzug',einzug,'px · Magentastich am Rand',r.saum,'von',r.rand,'· Datei',(buf.length/1024).toFixed(0),'kB');
  console.log(JSON.stringify(r.info.map(i=>i.hex)));
  console.log('Radien',r.info.map(i=>i.R0).join(' '));
  await br.close();
})();
