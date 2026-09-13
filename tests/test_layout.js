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
      ampelVersatz:(()=>{ if(!dot) return 99; const dr=dot.getBoundingClientRect(), m=dr.left+dr.width/2;
        return Math.max(...[...dot.querySelectorAll('b')].map(x=>{const r=x.getBoundingClientRect();
          return Math.abs((r.left+r.width/2)-m);})); })(),
      knopfGross:mehr?Math.round(Math.min(mehr.getBoundingClientRect().width,mehr.getBoundingClientRect().height)):0,
      ankerText:anker?anker.textContent:'',
      zeilenZahl:zeilen,
      textUeberlauf:Math.max(0,Math.ceil(st.scrollHeight-st.clientHeight)),
      leisteUeberRand:Math.round(Math.max(0,tr.bottom-unten)),
      vollstaendig:statusFullText()===txt+note+'Zur\u00fcck & Zug zeigen',
      // Ein falsch geschriebenes Sonderzeichen landet sonst als Buchstaben-
      // folge auf dem Bildschirm ("u00a0") - das faellt nur auf, wenn man den
      // sichtbaren Text selbst ansieht.
      sichtbar:[...st.querySelectorAll('.anker,.kurz')].map(e=>e.textContent).join(' ')};
  },TXT,NOTE,sat,sab,fs);
  console.log('INFO '+name+': '+JSON.stringify(r));
  ok('Meldungszeile steht ueber der Fussleiste ('+name+')',r.zeileVerdeckt===0,r.zeileVerdeckt+' px');
  ok('Ampelpunkt ist sichtbar ('+name+')',r.ampelDa,r.ampelDa);
  ok('Ampelpunkt ist gross genug zum Erkennen ('+name+')',r.ampelGross>=20,r.ampelGross+' px');
  ok('Ampellichter sitzen mittig im Gehaeuse ('+name+')',r.ampelVersatz<=1,r.ampelVersatz+' px Versatz');
  ok('Knopf fuer die Erklaerung ist gross genug zum Treffen ('+name+')',r.knopfGross>=30,r.knopfGross+' px');
  ok('Steinzahl steht fest in der oberen Zeile ('+name+')',/\d+ Steine? übrig/.test(r.ankerText),JSON.stringify(r.ankerText));
  ok('Zeile bleibt bei hoechstens zwei Zeilen ('+name+')',r.zeilenZahl<=2,r.zeilenZahl+' Zeilen');
  ok('Voller Wortlaut bleibt abrufbar ('+name+')',r.vollstaendig,r.vollstaendig);
  ok('Keine Zeichenreste im sichtbaren Text ('+name+')',
     !/u[0-9a-f]{4}|\\[nu]|&[a-z]+;/i.test(r.sichtbar), JSON.stringify(r.sichtbar.slice(0,60)));
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

 /* Der Hinweis auf eine neuere Version schwebt ueber dem Inhalt. Wuerde er im
    Fluss stehen, naehme er ueber fitStage Brettflaeche weg - genau das, was
    unten bei den Meldungen schon einmal schiefging. */
 const mitUpdate=await p.evaluate(()=>{ const br=()=>Math.round(document.getElementById('board').getBoundingClientRect().width);
   const ohne=br(); zeigeUpdate('9.9'); fitStage(); const mit=br();
   const e=document.getElementById('update'); const r=e.getBoundingClientRect();
   e.querySelector('.zu').click(); fitStage();
   return {ohne,mit,danach:br(),oben:Math.round(r.top),rechts:Math.round(r.right),
     fenster:Math.round(window.innerWidth)}; });
 console.log('INFO Brett mit Update-Hinweis: '+JSON.stringify(mitUpdate));
 ok('Update-Hinweis kostet keine Brettflaeche',
    mitUpdate.mit===mitUpdate.ohne&&mitUpdate.danach===mitUpdate.ohne,
    mitUpdate.ohne+' / '+mitUpdate.mit+' / '+mitUpdate.danach);
 /* Die einmalige Erklaerung zum Markierungszeichen steht 4,2 s als
    schwebende Meldung. Sie darf weder Brettflaeche kosten noch aus dem Bild
    laufen - der Satz ist laenger als die ueblichen Meldungen. */
 const mitToast=await p.evaluate(()=>{ const br=()=>Math.round(document.getElementById('board').getBoundingClientRect().width);
   const ohne=br();
   toast('Das Zeichen heißt: hier bleibt ein Stein stehen. Ein Tipp darauf sagt mehr.',4200);
   fitStage(); const mit=br();
   const t=document.getElementById('toast'), r=t.getBoundingClientRect();
   const leiste=document.querySelector('footer,#bar,.bar');
   t.classList.remove('on');
   return {ohne,mit,links:Math.round(r.left),rechts:Math.round(r.right),unten:Math.round(r.bottom),
     fenster:Math.round(window.innerWidth),hoehe:Math.round(window.innerHeight),
     leisteOben:leiste?Math.round(leiste.getBoundingClientRect().top):null}; });
 console.log('INFO Langer Toast: '+JSON.stringify(mitToast));
 ok('Lange schwebende Meldung kostet keine Brettflaeche',
    mitToast.mit===mitToast.ohne, mitToast.ohne+' / '+mitToast.mit);
 ok('Lange schwebende Meldung bleibt im Bild',
    mitToast.links>=0&&mitToast.rechts<=mitToast.fenster&&mitToast.unten<=mitToast.hoehe,
    JSON.stringify(mitToast));

 ok('Update-Hinweis bleibt im sichtbaren Bereich',
    mitUpdate.oben>=0&&mitUpdate.rechts<=mitUpdate.fenster,
    'oben '+mitUpdate.oben+', rechts '+mitUpdate.rechts+' von '+mitUpdate.fenster);

 // Die Steinzahl ist der feste Punkt, auf den der Blick faellt: sie darf beim
 // Wechsel der Meldungen weder wandern noch darf Zeile 2 zweizeilig werden.
 const ruhe=await p.evaluate((txt,note)=>{
   const st=document.getElementById('status');
   const mess=()=>({y:Math.round(st.querySelector('.anker').getBoundingClientRect().top),
     zeilen:Math.round(st.querySelector('.kurz').getBoundingClientRect().height/19)});
   const folge=[];
   setStatus('28 Steine \u00fcbrig.'); folge.push(mess());
   setStatus('In Ordnung \u2013 1 Stein ist weiterhin erreichbar.','ok',null,null,null,'1 Stein bleibt erreichbar'); folge.push(mess());
   setStatus(txt,'bad',[['Zur\u00fcck & Zug zeigen',()=>{}]],note,'Fehler: Stein gestrandet'); folge.push(mess());
   setStatus('28 Steine \u00fcbrig.'); zeigeRechnet(true); folge.push(mess());
   const band=document.getElementById('rechenband');
   const laufAn=st.classList.contains('rechnet'), bandAn=band.classList.contains('on');
   zeigeRechnet(false); folge.push(mess());
   const laufAus=st.classList.contains('rechnet'), bandAus=band.classList.contains('on');
   // Gleicher Takt: Ampel und Band duerfen nicht gegeneinander driften
   const dauerAmpel=getComputedStyle(st.querySelector('.dot b.r')).animationDuration;
   st.classList.add('rechnet'); const dA=getComputedStyle(st.querySelector('.dot b.r')).animationDuration; st.classList.remove('rechnet');
   const dB=getComputedStyle(band.querySelector('i')).animationDuration;
   return {folge:folge,laufAn:laufAn,laufAus:laufAus,bandAn:bandAn,bandAus:bandAus,takt:[dA,dB]};
 },TXT,NOTE);
 ok('Steinzahl bleibt beim Wechsel der Meldungen an derselben Stelle',
    ruhe.folge.every(f=>f.y===ruhe.folge[0].y), ruhe.folge.map(f=>f.y).join(' / '));
 ok('Untere Zeile bleibt immer einzeilig',
    ruhe.folge.every(f=>f.zeilen<=1), ruhe.folge.map(f=>f.zeilen).join(' / '));
 ok('Ampel laeuft beim Rechnen und steht danach still', ruhe.laufAn&&!ruhe.laufAus, ruhe.laufAn+' / '+ruhe.laufAus);
 ok('Band laeuft beim Rechnen und verschwindet danach', ruhe.bandAn&&!ruhe.bandAus, ruhe.bandAn+' / '+ruhe.bandAus);
 ok('Ampel und Band laufen im selben Takt', ruhe.takt[0]===ruhe.takt[1]&&ruhe.takt[0]!=='0s', ruhe.takt.join(' / '));

 // Sobald das Ergebnis steht, blitzt das zutreffende Licht einmal auf - und
 // nur einmal: danach ist die Klasse wieder weg.
 const blitz=await p.evaluate(()=>{ setStatus('28 Steine \u00fcbrig.'); zeigeRechnet(true); zeigeRechnet(false);
   setStatus('In Ordnung \u2013 1 Stein ist weiterhin erreichbar.','ok',null,null,null,'1 Stein bleibt erreichbar');
   return document.getElementById('status').classList.contains('blitz'); });
 await sleep(800);
 const blitzWeg=await p.evaluate(()=>!document.getElementById('status').classList.contains('blitz'));
 const ohneRechnen=await p.evaluate(()=>{ setStatus('In Ordnung \u2013 1 Stein ist weiterhin erreichbar.','ok',null,null,null,'1 Stein bleibt erreichbar');
   return document.getElementById('status').classList.contains('blitz'); });
 ok('Ergebnislicht blitzt nach dem Rechnen einmal auf', blitz, blitz);
 ok('Der Blitz ist nach einem Durchgang wieder aus', blitzWeg, blitzWeg);
 ok('Ohne vorheriges Rechnen blitzt nichts', !ohneRechnen, ohneRechnen);

 // Waehrend des Pendelns darf es nie ganz dunkel sein: ueber einen Zyklus
 // abtasten und den schwaechsten Moment festhalten.
 await p.evaluate(()=>{ setStatus('28 Steine \u00fcbrig.'); zeigeRechnet(true); });
 let schwaechster=1;
 for(let i=0;i<50;i++){
   const m=await p.evaluate(()=>Math.max(...[...document.querySelectorAll('#status .dot b')].map(x=>parseFloat(getComputedStyle(x).opacity))));
   if(m<schwaechster) schwaechster=m; await sleep(30);
 }
 await p.evaluate(()=>zeigeRechnet(false));
 ok('Beim Durchlauf ist immer ein Licht deutlich an', schwaechster>=0.6, 'schwaechster Moment '+schwaechster.toFixed(2));
 await p.close();
 await browser.close();
 console.log(fails?`\n${fails} FEHLER`:'\nLAYOUT-TESTS OK'); process.exitCode=fails?1:0;
})().catch(e=>{ console.error('CRASH',e); process.exit(1); });
