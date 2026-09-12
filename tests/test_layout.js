// Prueft, dass keine Meldung hinter der Fussleiste verschwindet - ueber
// Geraetegroessen, Schutzraender und Schriftgroessen hinweg. Die Werte kommen
// aus dem Geraet (gemessene Rechtecke), nicht aus derselben Rechnung wie im
// Code, damit der Test nicht dieselbe Annahme trifft wie fitStage.
const puppeteer=require(process.env.PUPPETEER_PATH||'puppeteer');
const path=require('path'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(n,c,x)=>{ console.log((c?'OK  ':'FAIL')+' '+n+(x!==undefined?' -> '+x:'')); if(!c) fails++; };

// Laengste Meldung, die die Strategie-Hinweise erzeugen koennen.
const TXT='Strategischer Fehler – Stein gestrandet. Orange im linken Arm und Grün im rechten Arm bleiben in jeder guten Fortsetzung stehen – kein Nachbar kann sie noch überspringen. Besser: Rosa über Rot nach rechts.';
const NOTE='Jetzt bestenfalls 2 Steine, vorher war 1 erreichbar.';
const FAELLE=[
 ['iPhone 14 Pro',393,852,59,34,14],
 ['iPhone 14 Pro, Schrift 18',393,852,59,34,18],
 ['iPhone 14 Pro, Schrift 22',393,852,59,34,22],
 ['iPhone SE',375,667,20,0,14],
 ['iPhone SE, Schrift 18',375,667,20,0,18],
 ['sehr enges Geraet',320,568,20,0,14],
];
(async()=>{
 const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--allow-file-access-from-files']});
 const url='file://'+path.resolve(__dirname,'..','index.html');
 for(const [name,w,h,sat,sab,fs] of FAELLE){
  const p=await browser.newPage(); await p.setViewport({width:w,height:h});
  await p.goto(url,{waitUntil:'load'}); await sleep(2300);
  const r=await p.evaluate((txt,note,sat,sab,fs)=>{
    document.documentElement.style.setProperty('--sat',sat+'px');
    document.documentElement.style.setProperty('--sab',sab+'px');
    const st=document.getElementById('status'); st.style.fontSize=fs+'px';
    stageShrink=0; statusReserveCache={w:-1,h:74}; fitStage();
    setStatus(txt,'bad',[['Zurück & Zug zeigen',()=>{}]],note);
    const tb=document.querySelector('.toolbar'), app=document.getElementById('app');
    const unten=app.getBoundingClientRect().bottom-parseFloat(getComputedStyle(app).paddingBottom||0);
    const tr=tb.getBoundingClientRect();
    const kurz=st.querySelector('.kurz'), dot=st.querySelector('.dot'), anker=st.querySelector('.anker'), mehr=st.querySelector('.mehr');
    const zeilen=Math.round(kurz.getBoundingClientRect().height/(parseFloat(getComputedStyle(st).fontSize)*1.35));
    return {brett:Math.round(document.getElementById('board').getBoundingClientRect().width),
      shrink:stageShrink,
      zeileVerdeckt:Math.round(Math.max(0,st.getBoundingClientRect().bottom-tr.top)),
      ampelDa:!!dot&&dot.getBoundingClientRect().width>0,
      ampelGross:dot?Math.round(dot.getBoundingClientRect().width):0,
      knopfGross:mehr?Math.round(Math.min(mehr.getBoundingClientRect().width,mehr.getBoundingClientRect().height)):0,
      ankerText:anker?anker.textContent:'',
      zeilenZahl:zeilen,
      textUeberlauf:Math.max(0,Math.ceil(st.scrollHeight-st.clientHeight)),
      leisteUeberRand:Math.round(Math.max(0,tr.bottom-unten)),
      vollstaendig:statusFullText()===txt+note+'Zur\u00fcck & Zug zeigen'};
  },TXT,NOTE,sat,sab,fs);
  console.log('INFO '+name+': '+JSON.stringify(r));
  ok('Meldungszeile steht ueber der Fussleiste ('+name+')',r.zeileVerdeckt===0,r.zeileVerdeckt+' px');
  ok('Ampelpunkt ist sichtbar ('+name+')',r.ampelDa,r.ampelDa);
  ok('Ampelpunkt ist gross genug zum Erkennen ('+name+')',r.ampelGross>=20,r.ampelGross+' px');
  ok('Knopf fuer die Erklaerung ist gross genug zum Treffen ('+name+')',r.knopfGross>=30,r.knopfGross+' px');
  ok('Steinzahl steht fest in der oberen Zeile ('+name+')',/\d+ Steine? übrig/.test(r.ankerText),JSON.stringify(r.ankerText));
  ok('Zeile bleibt bei hoechstens zwei Zeilen ('+name+')',r.zeilenZahl<=2,r.zeilenZahl+' Zeilen');
  ok('Voller Wortlaut bleibt abrufbar ('+name+')',r.vollstaendig,r.vollstaendig);
  ok('Meldung laeuft nicht aus ihrem Kasten ('+name+')',r.textUeberlauf===0,r.textUeberlauf+' px');
  ok('Fussleiste bleibt im sichtbaren Bereich ('+name+')',r.leisteUeberRand===0,r.leisteUeberRand+' px');
  ok('Brett bleibt benutzbar gross ('+name+')',r.brett>=100,r.brett+' px');
  if(w===393) ok('Brett nutzt die volle Breite (iPhone 14 Pro)',r.brett>=360,r.brett+' px');
  await p.close();
 }
 // Das Brett darf waehrend einer Partie nicht hin und her springen.
 const p=await browser.newPage(); await p.setViewport({width:393,height:852});
 await p.goto(url,{waitUntil:'load'}); await sleep(2300);
 const stabil=await p.evaluate((txt,note)=>{
   document.documentElement.style.setProperty('--sat','59px');
   document.documentElement.style.setProperty('--sab','34px');
   stageShrink=0; statusReserveCache={w:-1,h:74}; fitStage();
   const br=()=>Math.round(document.getElementById('board').getBoundingClientRect().width);
   const folge=[];
   setStatus('27 Steine übrig.'); folge.push(br());
   setStatus(txt,'bad',[['Zurück & Zug zeigen',()=>{}]],note); folge.push(br());
   setStatus('In Ordnung – 1 Stein ist weiterhin erreichbar.','ok'); folge.push(br());
   setStatus(txt,'bad',[['Zurück & Zug zeigen',()=>{}]],note); folge.push(br());
   return folge;
 },TXT,NOTE);
 console.log('INFO Brettbreiten im Wechsel kurz/lang/kurz/lang: '+JSON.stringify(stabil));
 ok('Brett springt beim Wechsel der Meldungen nicht',stabil.every(v=>v===stabil[0]),stabil.join(' / '));
 await p.close();
 await browser.close();
 console.log(fails?`\n${fails} FEHLER`:'\nLAYOUT-TESTS OK'); process.exitCode=fails?1:0;
})().catch(e=>{ console.error('CRASH',e); process.exit(1); });
