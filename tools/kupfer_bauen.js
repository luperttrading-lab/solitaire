/* Baut 5-karte.jpg aus Lutz' Vorlage (v1.90) und nennt ihre Mittelfarbe
   (KARTE_HEX in index.html). Aufruf: node tools/kupfer_bauen.js <karte.png>
   5-kupfer.jpg ist seit v1.91 Lutz' Datei UNVERAENDERT (1024 x 1024) - keine
   Farbkorrektur, kein Zuschnitt; die Masse stehen in FOTO_KUPFER.
   (v1.90 baute hier noch ein 4096-px-Brett um: Rosastich herausgerechnet,
   zugeschnitten, verkleinert - siehe Git.) */
const puppeteer=require('puppeteer');const fs=require('fs');const path=require('path');
(async()=>{
  const [karte]=process.argv.slice(2);
  const br=await puppeteer.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});const p=await br.newPage();
  const r=await p.evaluate(async b=>{
    const k=new Image(); k.src='data:image/png;base64,'+b; await k.decode();
    const c=document.createElement('canvas'); c.width=k.width; c.height=k.height; const x=c.getContext('2d'); x.drawImage(k,0,0);
    const d=x.getImageData(0,0,k.width,k.height).data; let s=[0,0,0],n=0; for(let i=0;i<d.length;i+=16){ s[0]+=d[i]; s[1]+=d[i+1]; s[2]+=d[i+2]; n++; }
    return {karte:c.toDataURL('image/jpeg',.78), mittel:s.map(v=>Math.round(v/n)), w:k.width, h:k.height};
  },fs.readFileSync(karte).toString('base64'));
  const z=path.join(__dirname,'..','5-karte.jpg');
  fs.writeFileSync(z,Buffer.from(r.karte.split(',')[1],'base64'));
  console.log('5-karte.jpg',(fs.statSync(z).size/1024).toFixed(0),'kB',r.w+'x'+r.h,'Mittelfarbe #'+r.mittel.map(v=>v.toString(16).padStart(2,'0')).join(''));
  await br.close();
})();
