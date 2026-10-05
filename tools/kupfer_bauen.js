/* Baut 5-kupfer.jpg und 5-karte.jpg aus Lutz' Vorlagen (v1.90).
   Aufruf: node tools/kupfer_bauen.js <brett.png> <karte.png>
   Brett: 4096 x 4096, 33 Loecher, Raster vermessen (Kantenanpassung): Abstand
   415,14 px in x und y, Loch (0,0) bei 800,4 / 801,6, Rahmen aussen 140...3955.
   Farbe: Rosastich herausgerechnet - Gewinn je Kanal so, dass das Pergament
   zwischen den Loechern den Ton des 45er-Bretts trifft (226/190/175 ->
   212/185/159). Zugeschnitten auf 136...3960 und auf 1536 px verkleinert.
   Karte: unveraendert, nur als JPEG. */
const puppeteer=require('puppeteer');const fs=require('fs');const path=require('path');
(async()=>{
  const [brett,karte]=process.argv.slice(2);
  const br=await puppeteer.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});const p=await br.newPage();
  const r=await p.evaluate(async(b1,b2)=>{
    const lade=async b=>{const im=new Image();im.src='data:image/png;base64,'+b;await im.decode();return im;};
    const a=await lade(b1), k=await lade(b2);
    const Z=1536, c=document.createElement('canvas'); c.width=c.height=Z; const x=c.getContext('2d'); x.imageSmoothingQuality='high';
    x.drawImage(a,136,136,3824,3824,0,0,Z,Z);
    const id=x.getImageData(0,0,Z,Z), d=id.data, g=[212/226,185/190,159/175];
    for(let i=0;i<d.length;i+=4){ d[i]=Math.min(255,d[i]*g[0]); d[i+1]=Math.min(255,d[i+1]*g[1]); d[i+2]=Math.min(255,d[i+2]*g[2]); }
    x.putImageData(id,0,0);
    const c2=document.createElement('canvas'); c2.width=k.width; c2.height=k.height; const x2=c2.getContext('2d'); x2.drawImage(k,0,0);
    const kd=x2.getImageData(0,0,k.width,k.height).data; let s=[0,0,0],n=0; for(let i=0;i<kd.length;i+=16){ s[0]+=kd[i]; s[1]+=kd[i+1]; s[2]+=kd[i+2]; n++; }
    return {brett:c.toDataURL('image/jpeg',.84), karte:c2.toDataURL('image/jpeg',.78), mittel:s.map(v=>Math.round(v/n)), kw:k.width, kh:k.height};
  },fs.readFileSync(brett).toString('base64'),fs.readFileSync(karte).toString('base64'));
  const z=path.join(__dirname,'..');
  fs.writeFileSync(path.join(z,'5-kupfer.jpg'),Buffer.from(r.brett.split(',')[1],'base64'));
  fs.writeFileSync(path.join(z,'5-karte.jpg'),Buffer.from(r.karte.split(',')[1],'base64'));
  const f=1536/3824;
  console.log('5-kupfer.jpg',(fs.statSync(path.join(z,'5-kupfer.jpg')).size/1024).toFixed(0),'kB · x0',((800.4-136)*f).toFixed(2),'y0',((801.6-136)*f).toFixed(2),'dx',(415.14*f).toFixed(3),'Rahmen',((140-136)*f).toFixed(1),((3955-136)*f).toFixed(1));
  console.log('5-karte.jpg',(fs.statSync(path.join(z,'5-karte.jpg')).size/1024).toFixed(0),'kB',r.kw+'x'+r.kh,'Mittelfarbe',r.mittel,'#'+r.mittel.map(v=>v.toString(16).padStart(2,'0')).join(''));
  await br.close();
})();
