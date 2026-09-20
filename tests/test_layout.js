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
    setStatus(txt,'bad',[['Zug zurück',()=>{}]],note);
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
      vollstaendig:statusFullText()===txt+note+'Zug zur\u00fcck',
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
   setStatus(txt,'bad',[['Zug zurück',()=>{}]],note); folge.push(br());
   setStatus('In Ordnung – 1 Stein ist weiterhin erreichbar.','ok'); folge.push(br());
   setStatus(txt,'bad',[['Zug zurück',()=>{}]],note); folge.push(br());
   return folge;
 },TXT,NOTE);
 console.log('INFO Brettbreiten im Wechsel kurz/lang/kurz/lang: '+JSON.stringify(stabil));
 ok('Brett springt beim Wechsel der Meldungen nicht',stabil.every(v=>v===stabil[0]),stabil.join(' / '));

 /* Der Fertig-Knopf muss ohne Scrollen erreichbar sein - das Menue ist
    laenger als jeder Bildschirm. Geprueft ueber mehrere Geraetehoehen: der
    Knopf liegt im sichtbaren Teil des Blattes, das Blatt selbst im Bild, und
    der Scrollbereich ist trotzdem scrollbar (der Inhalt geht ja weiter). */
 for(const [name,w,h] of [['iPhone 14 Pro',393,852],['iPhone SE',375,667],['sehr klein',360,600]]){
   const pf=await browser.newPage(); await pf.setViewport({width:w,height:h});
   await pf.goto(url,{waitUntil:'load'}); await sleep(2300);
   // Das Blatt faehrt in 0,3 s hoch - vorher gemessen liegt alles noch unten
   await pf.evaluate(()=>{
     document.documentElement.style.setProperty('--sat','59px');
     document.documentElement.style.setProperty('--sab','34px');
     /* Geraetelage nachstellen: auf dem iPhone ist screen.height gleich der
        Viewport-Hoehe, wenn die App vom Home-Bildschirm laeuft. Ohne das
        haelt sockelRandSetzen die Differenz zum Testmonitor faelschlich
        fuer freien Platz. */
     try{ Object.defineProperty(screen,'height',
       {value:window.innerHeight,configurable:true}); }catch(e){}
     sockelRandSetzen();
     openSheet(); });
   await sleep(450);
   const r=await pf.evaluate(()=>{
     const blatt=document.getElementById('sheet');
     const knopf=document.getElementById('btnCloseSheet');
     const sc=blatt.querySelector('.scroll');
     const bb=blatt.getBoundingClientRect(), kb=knopf.getBoundingClientRect();
     // Ohne zu scrollen: liegt der Knopf im Bild und innerhalb des Blattes?
     const ergebnis={
       imBild: kb.top>=0&&kb.bottom<=window.innerHeight+0.5,
       imBlatt: kb.bottom<=bb.bottom+0.5,
       hoehe: Math.round(kb.height),
       breite: Math.round(kb.width),
       ueberFussrand: Math.round(window.innerHeight-34-kb.bottom),
       scrollbar: sc.scrollHeight>sc.clientHeight+2,
       /* Das Blatt darf durch die Fusszeile nicht zusammenschrumpfen. Mit
          flex-basis 0 passierte genau das: Blatt 134 px, davon 16 px Inhalt -
          und die alte Pruefung liess es durch, weil der Knopf ja im Bild lag
          und "scrollbar" auch stimmte. Deshalb wird jetzt die Hoehe selbst
          gemessen, gegen das, was das Blatt hoechstens einnehmen darf. */
       blatt: Math.round(bb.height),
       sockel: Math.round(blatt.querySelector('.fuss').getBoundingClientRect().height),
       moeglich: Math.round(window.innerHeight-59-30),
       sichtbar: Math.round(sc.clientHeight),
       // Nach dem Scrollen ans Ende darf er nicht wandern
       vorScroll: Math.round(kb.top)
     };
     sc.scrollTop=sc.scrollHeight;
     ergebnis.nachScroll=Math.round(knopf.getBoundingClientRect().top);
     closeSheet();
     return ergebnis; });
   console.log('INFO Fertig-Knopf ('+name+'): '+JSON.stringify(r));
   ok('Fertig steht ohne Scrollen im Bild ('+name+')', r.imBild&&r.imBlatt, JSON.stringify(r));
   /* Apples 44 pt gelten fuer die kleinste Kante eines freistehenden Ziels.
      Hier geht der Knopf ueber die volle Breite - entscheidend ist die
      Trefferflaeche, und die ist ein Vielfaches davon. Trotzdem eine
      Untergrenze fuer die Hoehe, damit der Sockel nicht weiter schrumpft. */
   ok('Fertig ist gross genug zum Treffen ('+name+')',
      r.hoehe>=38&&r.hoehe*r.breite>=44*44, r.hoehe+' x '+r.breite+' px');
   /* Der Sockel soll so wenig Platz nehmen wie moeglich. Was bleibt, ist
      der Schutzrand des Geraets - der ist Vorgabe, nicht Gestaltung. */
   ok('Der Sockel bleibt schmal ('+name+')',
      r.sockel-34<=52, (r.sockel-34)+' px ueber dem Schutzrand (Sockel '+r.sockel+')');
   ok('Fertig bleibt beim Scrollen an derselben Stelle ('+name+')',
      r.vorScroll===r.nachScroll, r.vorScroll+' / '+r.nachScroll);
   ok('Der Inhalt darueber laesst sich weiter scrollen ('+name+')', r.scrollbar, r.scrollbar);
   ok('Das Blatt nutzt die volle moegliche Hoehe ('+name+')',
      r.blatt>=r.moeglich-2, r.blatt+' von '+r.moeglich+' px');
   ok('Der Inhalt bekommt den Grossteil des Blattes ('+name+')',
      r.sichtbar>=r.blatt*0.7, r.sichtbar+' von '+r.blatt+' px ('
      +Math.round(100*r.sichtbar/r.blatt)+' %)');
   /* Das Ampel-Blatt ist kurz - es darf nicht die volle Hoehe fuellen, aber
      sein Fertig-Knopf muss im Bild liegen und der Regler gross genug sein.
      Geprueft auf denselben drei Geraetehoehen. */
   const pa=await browser.newPage(); await pa.setViewport({width:w,height:h});
   await pa.goto(url,{waitUntil:'load'}); await sleep(2300);
   await pa.evaluate(()=>{
     document.documentElement.style.setProperty('--sat','59px');
     document.documentElement.style.setProperty('--sab','34px');
     try{ Object.defineProperty(screen,'height',
       {value:window.innerHeight,configurable:true}); }catch(e){}
     sockelRandSetzen(); ampelBlattAuf(); });
   await sleep(450);
   const ra=await pa.evaluate(()=>{
     const blatt=document.getElementById('ampelBlatt');
     const knopf=document.getElementById('ampelClose');
     const regler=document.getElementById('ampelRegler');
     const proben=document.querySelectorAll('.aprobe');
     const bb=blatt.getBoundingClientRect(), kb=knopf.getBoundingClientRect(),
           rb=regler.getBoundingClientRect();
     const sicht=[...proben].every(e=>{ const r=e.getBoundingClientRect();
       return r.top>=0&&r.bottom<=window.innerHeight+0.5&&r.width>0; });
     return {
       imBild: kb.top>=0&&kb.bottom<=window.innerHeight+0.5,
       imBlatt: kb.bottom<=bb.bottom+0.5,
       blattImBild: bb.top>=0&&bb.bottom<=window.innerHeight+0.5,
       reglerHoehe: Math.round(rb.height), reglerBreite: Math.round(rb.width),
       reglerImBild: rb.top>=0&&rb.bottom<=window.innerHeight+0.5,
       probenSichtbar: sicht, probenZahl: proben.length,
       blatt: Math.round(bb.height), fenster: window.innerHeight
     }; });
   console.log('INFO Ampel-Blatt ('+name+'): '+JSON.stringify(ra));
   ok('Das Ampel-Blatt liegt im Bild ('+name+')',
      ra.blattImBild&&ra.imBild&&ra.imBlatt, JSON.stringify(ra));
   ok('Alle drei Proben sind zu sehen ('+name+')',
      ra.probenSichtbar&&ra.probenZahl===3, ra.probenZahl+' Proben, sichtbar '+ra.probenSichtbar);
   /* Der Regler ist das Bedienteil - er muss zu treffen sein. */
   ok('Der Regler ist gross genug zum Ziehen ('+name+')',
      ra.reglerImBild&&ra.reglerHoehe>=30&&ra.reglerBreite>=200,
      ra.reglerHoehe+' x '+ra.reglerBreite+' px');
   await pa.close();
   await pf.close();
 }

 /* Rechts in der Zaehlerzeile sitzt ein Block aus vier Zellen: Tipps und
    Rettungen, je Wort und Zahl nebeneinander, zwei Zeilen untereinander.
    Die drei grossen Zahlen duerfen dadurch nicht zerquetscht werden, und
    der Block darf beim Hochzaehlen nicht breiter werden. */
 for(const [name,w,h] of [['iPhone 14 Pro',393,852],['iPhone SE',375,667],['sehr klein',360,600]]){
   const pz=await browser.newPage(); await pz.setViewport({width:w,height:h});
   await pz.goto(url,{waitUntil:'load'}); await sleep(2300);
   const r=await pz.evaluate(()=>{
     const hud=document.querySelector('.hud'), block=hud.querySelector('.neben');
     const brett=()=>Math.round(document.getElementById('board').getBoundingClientRect().width);
     const mass=()=>{
       const gross=[...hud.children].filter(d=>d.tagName==='DIV');
       const dt=[...block.querySelectorAll('dt')], dd=[...block.querySelectorAll('dd')];
       const zeilen=x=>Math.max(1,Math.round(x.getBoundingClientRect().height
         /(parseFloat(getComputedStyle(x).lineHeight)||16)));
       return {blockBreite:Math.round(block.getBoundingClientRect().width),
         grossBreiten:gross.map(d=>Math.round(d.getBoundingClientRect().width)),
         labelZeilen:gross.map(d=>zeilen(d.querySelector('span'))),
         paarGleicheHoehe:dt.every((e,i)=>Math.abs(e.getBoundingClientRect().top-dd[i].getBoundingClientRect().top)<6),
         zweiZeilen:dt[1].getBoundingClientRect().top>dt[0].getBoundingClientRect().top+4,
         drin:Math.round(block.getBoundingClientRect().right)<=Math.round(hud.getBoundingClientRect().right)+1,
         hoehe:Math.round(hud.getBoundingClientRect().height)}; };
     game.rueckAlarm=0; game.tippKeys=new Set(); renderHud(); fitStage();
     const leer=mass(), brettLeer=brett();
     game.rueckAlarm=12; game.tippKeys=new Set('abcdefghijkl'.split('')); renderHud(); fitStage();
     const voll=mass(), brettVoll=brett();
     game.rueckAlarm=0; game.tippKeys=new Set(); renderHud(); fitStage();
     return {leer,voll,brettLeer,brettVoll}; });
   console.log('INFO Zaehlerblock ('+name+'): Block '+r.voll.blockBreite
     +' px, grosse Spalten '+JSON.stringify(r.voll.grossBreiten));
   ok('Wort und Zahl stehen auf einer Hoehe ('+name+')', r.voll.paarGleicheHoehe);
   ok('Tipps und Rettungen stehen untereinander ('+name+')', r.voll.zweiZeilen);
   ok('Der Block bleibt in der Zeile ('+name+')', r.voll.drin);
   ok('Keine Beschriftung bricht um ('+name+')',
      r.voll.labelZeilen.every(z=>z<=1), JSON.stringify(r.voll.labelZeilen));
   ok('Die drei Hauptzahlen behalten den meisten Platz ('+name+')',
      Math.min.apply(null,r.voll.grossBreiten)>r.voll.blockBreite,
      JSON.stringify(r.voll.grossBreiten)+' gegen '+r.voll.blockBreite);
   ok('Der Block wird beim Zaehlen nicht breiter ('+name+')',
      r.leer.blockBreite===r.voll.blockBreite, r.leer.blockBreite+' / '+r.voll.blockBreite);
   ok('Die Zeile waechst beim Zaehlen nicht ('+name+')',
      r.leer.hoehe===r.voll.hoehe, r.leer.hoehe+' / '+r.voll.hoehe);
   ok('Die Zaehler kosten keine Brettflaeche ('+name+')',
      r.brettVoll===r.brettLeer, r.brettLeer+' / '+r.brettVoll);
   await pz.close();
 }

 /* Die Ergebniskarte traegt jetzt eine Zeile mehr - die Zaehler neben der
    Steinzahl. Sie muss auf jedem Geraet ganz ins Bild passen, und der Block
    muss rechts der Zahl stehen (oder, wenn es eng wird, sauber darunter -
    nie ueberlappend). */
 for(const [name,w,h] of [['iPhone 14 Pro',393,852],['iPhone SE',375,667],['sehr klein',360,600]]){
   const pe=await browser.newPage(); await pe.setViewport({width:w,height:h});
   await pe.goto(url,{waitUntil:'load'}); await sleep(2300);
   const r=await pe.evaluate(async()=>{ const B=game.board; newGame('english');
     for(let i=0;i<B.n;i++) game.pegAt[i]=-1; game.pegAt[B.centerIdx]=0;
     game.finished=false; game.startedAt=Date.now()-296000; game.elapsedBefore=0;
     game.history=new Array(31).fill({mi:0,jumped:0});
     game.rueckAlarm=12; game.tippKeys=new Set('abcdefghijkl'.split(''));
     afterMove(true); showModal('resultModal');
     await new Promise(x=>setTimeout(x,450));
     const k=document.querySelector('#resultModal .card').getBoundingClientRect();
     const big=document.getElementById('resBig').getBoundingClientRect();
     const nb=document.querySelector('.ergneben').getBoundingClientRect();
     const txt=document.getElementById('resText');
     return {karte:{t:Math.round(k.top),b:Math.round(k.bottom),w:Math.round(k.width)},
       imBild:k.top>=0&&k.bottom<=window.innerHeight,
       /* Entweder rechts daneben oder darunter - aber nie ineinander. */
       getrennt:nb.left>=big.right-1||nb.top>=big.bottom-1,
       textOhneZaehler:!/Rettung|Tipp/.test(txt.textContent),
       fensterH:window.innerHeight}; });
   console.log('INFO Ergebniskarte ('+name+'): '+JSON.stringify(r.karte)+' in '+r.fensterH+' px');
   ok('Die Ergebniskarte passt ins Bild ('+name+')', r.imBild===true, JSON.stringify(r.karte));
   ok('Steinzahl und Zaehler ueberlappen nicht ('+name+')', r.getrennt===true);
   ok('Der Ergebnistext wiederholt die Zaehler nicht ('+name+')', r.textOhneZaehler===true);
   await pe.close();
 }

 /* Die Pause deckt das Brett vollstaendig ab und kostet keine Brettflaeche -
    sie liegt absolut ueber dem Stage, nicht im Fluss. */
 {
   const pp=await browser.newPage(); await pp.setViewport({width:393,height:852});
   await pp.goto(url,{waitUntil:'load'}); await sleep(2300);
   const r=await pp.evaluate(async()=>{
     const brett=()=>Math.round(document.getElementById('board').getBoundingClientRect().width);
     newGame('english'); const l=currentLine();
     applyMove(game.board.moves[l.path[0]],true); render(); renderHud(); fitStage();
     const vorher=brett();
     const zelle=document.getElementById('hudZeit').getBoundingClientRect();
     document.getElementById('hudZeit').click();
     await new Promise(x=>setTimeout(x,80)); fitStage();
     const st=document.getElementById('stage').getBoundingClientRect();
     const pa=document.getElementById('pause').getBoundingClientRect();
     const knopf=document.getElementById('btnWeiter').getBoundingClientRect();
     const erg={brettVorher:vorher,brettInPause:brett(),
       zelle:{b:Math.round(zelle.width),h:Math.round(zelle.height)},
       deckt:pa.left<=st.left+1&&pa.right>=st.right-1&&pa.top<=st.top+1&&pa.bottom>=st.bottom-1,
       /* Ein Quadrat, gross und genau in der Mitte der Brettflaeche (Wunsch
          von Lutz): als Zeile quer ueber das Brett las er ihn nicht als
          Knopf. Die Mitte haengt an grid-row - ohne die Zuweisung sortiert
          das Grid nach der Reihenfolge im Text und der Knopf sass 114 px zu
          tief. */
       knopfH:Math.round(knopf.height), knopfB:Math.round(knopf.width),
       quadratisch:Math.abs(knopf.width-knopf.height)<2,
       versatzX:Math.round((knopf.left+knopf.right)/2-(st.left+st.right)/2),
       versatzY:Math.round((knopf.top+knopf.bottom)/2-(st.top+st.bottom)/2),
       knopfImBild:knopf.top>=st.top&&knopf.bottom<=st.bottom};
     document.getElementById('btnWeiter').click();
     return erg; });
   const ruhe=await pp.evaluate(async()=>{
     newGame('english'); const l=currentLine();
     applyMove(game.board.moves[l.path[0]],true); render(); renderHud(); fitStage();
     const mass=()=>({spalten:[...document.querySelector('.hud').children].map(e=>Math.round(e.getBoundingClientRect().left)),
       hudHoehe:Math.round(document.querySelector('.hud').getBoundingClientRect().height),
       statusTop:Math.round(document.getElementById('status').getBoundingClientRect().top),
       zeitLinks:Math.round(document.getElementById('hudTime').getBoundingClientRect().left)});
     const vor=mass();
     document.getElementById('hudZeit').click();
     await new Promise(x=>setTimeout(x,120));
     const drin=mass();
     document.getElementById('btnWeiter').click();
     await new Promise(x=>setTimeout(x,120));
     return {vor,drin,nach:mass()}; });
   const gl=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
   console.log('INFO Pause-Ruhe: '+JSON.stringify(ruhe.vor)+' -> '+JSON.stringify(ruhe.drin));
   /* "Angehalten" ist breiter als "Zeit ❙❙" - die Spalten sind 1fr und
      halten trotzdem still. Ungeprueft waere das reine Hoffnung. */
   ok('Die Zaehlerzeile verrutscht beim Pausieren nicht',
      gl(ruhe.vor.spalten,ruhe.drin.spalten)&&ruhe.vor.zeitLinks===ruhe.drin.zeitLinks,
      JSON.stringify([ruhe.vor.spalten,ruhe.drin.spalten]));
   ok('Zeilenhoehe und Statuszeile bleiben stehen',
      ruhe.vor.hudHoehe===ruhe.drin.hudHoehe&&ruhe.vor.statusTop===ruhe.drin.statusTop,
      ruhe.vor.hudHoehe+'/'+ruhe.drin.hudHoehe+' px, Status '+ruhe.vor.statusTop+'/'+ruhe.drin.statusTop);
   ok('Nach dem Weiter steht alles wieder wie vorher', gl(ruhe.vor,ruhe.nach));
   console.log('INFO Pause-Decke: '+JSON.stringify(r));
   ok('Die Pause deckt das Brett vollstaendig', r.deckt===true);
   ok('Die Pause kostet keine Brettflaeche', r.brettInPause===r.brettVorher,
      r.brettVorher+' / '+r.brettInPause);
   ok('Der Weiter-Knopf ist ein Quadrat und gross genug',
      r.quadratisch===true&&r.knopfH>=88&&r.knopfImBild===true, r.knopfB+'x'+r.knopfH);
   ok('Der Weiter-Knopf sitzt genau in der Mitte des Bretts',
      Math.abs(r.versatzX)<=1&&Math.abs(r.versatzY)<=1, r.versatzX+'/'+r.versatzY+' px');
   ok('Die Zeit-Zelle ist gross genug zum Treffen',
      r.zelle.b>=44&&r.zelle.h>=44, r.zelle.b+'x'+r.zelle.h);
   /* Der Pause-Chip darf die Chip-Zeile nicht sprengen und keine
      Brettflaeche kosten - sie wird von fitStage mitgerechnet. */
   const cz=await pp.evaluate(async()=>{
     newGame('english');
     const brettVorher=Math.round(document.getElementById('board').getBoundingClientRect().width);
     const zeilenVorher=Math.round(document.querySelector('.quick').getBoundingClientRect().height);
     const l=currentLine(); applyMove(game.board.moves[l.path[0]],true); render(); renderHud(); fitStage();
     const q=document.querySelector('.quick').getBoundingClientRect();
     const st=document.getElementById('btnComputer').getBoundingClientRect();
     const pa=document.getElementById('btnPause').getBoundingClientRect();
     /* Einzeilig heisst hier: nicht hoeher als der Strategie-Chip, der
        nachweislich einzeilig ist. Die sonst uebliche Formel Hoehe durch
        line-height taugt bei einem Chip mit Polster nicht - line-height ist
        dort "normal", parseFloat liefert NaN, und der Rueckfall auf 16 px
        macht aus 29 px zwei Zeilen (einmal erlebt). */
     const zu=document.getElementById('btnZuege').getBoundingClientRect();
     return {beideDrin:st.left>=q.left-1&&zu.right<=q.right+1,
       zuegeDrin:zu.left>=q.left-1&&zu.right<=q.right+1&&Math.abs(st.top-zu.top)<2,
       zuegeBreit:Math.round(zu.width), luft:Math.round((q.right-zu.right)+(st.left-q.left)),
       aufEinerHoehe:Math.abs(st.top-pa.top)<2,
       chipHoehe:Math.round(pa.height), stratHoehe:Math.round(st.height),
       einzeilig:Math.abs(pa.height-st.height)<2&&pa.height<40,
       gesamt:Math.round(pa.right-st.left), zeile:Math.round(q.width),
       brett:Math.round(document.getElementById('board').getBoundingClientRect().width),
       brettVorher, zeilenHoehe:Math.round(q.height), zeilenVorher}; });
   console.log('INFO Chip-Zeile: '+JSON.stringify(cz));
   ok('Beide Chips passen nebeneinander in die Zeile',
      cz.beideDrin===true&&cz.aufEinerHoehe===true&&cz.einzeilig===true, JSON.stringify(cz));
   ok('Die Chip-Zeile waechst durch den Pause-Chip nicht',
      cz.zeilenHoehe===cz.zeilenVorher, cz.zeilenVorher+' / '+cz.zeilenHoehe+' px');
   ok('Der Pause-Chip kostet keine Brettflaeche',
      cz.brett===cz.brettVorher, cz.brettVorher+' / '+cz.brett);
   /* Seit v1.60 steht ein dritter Chip daneben (alle moeglichen Zuege). Auf
      320 px Breite fuellten drei Chips die Zeile bis auf 2 px aus - kein
      Abstand, auf den man bauen kann. Unter 386 px sind Polster und Schrift
      deshalb eine Stufe kleiner; geprueft wird der uebrige Platz, nicht nur
      ob der Chip zufaellig noch hineinpasst. */
   ok('Auch der Zuege-Chip steht in der Zeile',
      cz.zuegeDrin===true, JSON.stringify({zuegeDrin:cz.zuegeDrin,breit:cz.zuegeBreit}));
   ok('Und die Zeile hat noch Luft', cz.luft>=16, cz.luft+' px frei');
   await pp.close();
 }

 /* Die engen Geraete pruefen den dritten Chip erst richtig: dort greift die
    kleinere Stufe (unter 386 px). Ohne sie blieben auf 320 px genau 2 px
    uebrig - bei groesserer Systemschrift waere die Zeile uebergelaufen. */
 for(const [name,w,h] of [['iPhone SE',375,667],['sehr klein',360,600],['ganz schmal',320,568]]){
   const pc=await browser.newPage(); await pc.setViewport({width:w,height:h});
   await pc.goto(url,{waitUntil:'load'}); await sleep(2300);
   const c=await pc.evaluate(()=>{ newGame('english');
     const l=currentLine(); applyMove(game.board.moves[l.path[0]],true); render(); renderHud(); fitStage();
     const q=document.querySelector('.quick').getBoundingClientRect();
     const cs=[...document.querySelectorAll('.quick .pill')].map(e=>e.getBoundingClientRect());
     return {n:cs.length, hoehe:Math.round(q.height),
       chipHoehe:Math.round(cs[0].height),
       eineZeile:cs.every(r=>Math.abs(r.top-cs[0].top)<2),
       drin:cs[0].left>=q.left-1&&cs[cs.length-1].right<=q.right+1,
       luft:Math.round((q.right-cs[cs.length-1].right)+(cs[0].left-q.left))}; });
   console.log('INFO Chip-Zeile '+name+': '+JSON.stringify(c));
   ok('['+name+'] Alle drei Chips stehen auf einer Zeile',
      c.n===3&&c.eineZeile===true&&c.drin===true, JSON.stringify(c));
   ok('['+name+'] Und die Zeile hat noch Luft', c.luft>=16, c.luft+' px frei');
   ok('['+name+'] Die Chip-Zeile bleibt einzeilig hoch',
      c.hoehe<=c.chipHoehe+10, c.hoehe+' px bei Chip '+c.chipHoehe);
   await pc.close();
 }

 /* Der Stand der Gruen-Analyse (v1.65) sitzt als kleines Feld unten rechts
    UEBER dem Brett - in der Ecke, die auf dem Kreuzbrett frei ist - und darf
    keine Brettflaeche kosten. */
 for(const [name,w,h] of [['iPhone 14 Pro',393,852],['iPhone SE',375,667],['sehr klein',360,600]]){
   const ps=await browser.newPage(); await ps.setViewport({width:w,height:h});
   await ps.goto(url,{waitUntil:'load'}); await sleep(2300);
   const r=await ps.evaluate(()=>{ settings.computer=true; settings.gruen=true; settings.zuege=true; newGame('english');
     const vorher=Math.round(document.getElementById('board').getBoundingClientRect().width);
     game.gruen={key:stateKey(),gesamt:4,gut:new Set([1,2]),schlecht:new Set(),offen:[],spaeter:[{}],laeuft:false,fertig:true,zuGross:true};
     renderZuegeStand();
     const e=document.getElementById('zuegeStand'), b=e.getBoundingClientRect(), bd=document.getElementById('board').getBoundingClientRect();
     /* Die freie Ecke: rechts der Spalte 4 und unter der Zeile 4 des Kreuzes. */
     const lay=game.lay, m=document.getElementById('board').getScreenCTM();
     const eck=game.board.cells.map((c,i)=>i).filter(i=>game.board.cells[i].r>=4&&game.board.cells[i].c>=4)
       .map(i=>{ const p=lay.pos[i]; return {x:m.a*p.x+m.c*p.y+m.e, y:m.b*p.x+m.d*p.y+m.f}; });
     const R=34*m.a; // Murmelradius in px
     const deckt=eck.some(p=>p.x+R>b.left&&p.y+R>b.top);
     const sichtbar=!e.hidden, text=e.textContent;   // VOR dem Aufraeumen lesen (einmal danach gelesen: immer versteckt)
     settings.gruen=false; settings.zuege=false; game.gruen=null; renderZuegeStand();
     /* Trefferflaeche = Kasten plus unsichtbarer Rand (::after, inset) */
     const rand=-parseFloat(getComputedStyle(e,'::after').top)||0;
     return {sichtbar, text, imBrett:b.right<=bd.right+1&&b.bottom<=bd.bottom+1&&b.left>=bd.left, hoehe:Math.round(b.height), breite:Math.round(b.width),
       treffH:Math.round(b.height+2*rand), treffB:Math.round(b.width+2*rand),
       deckt, brettVorher:vorher, brett:Math.round(bd.width)}; });
   console.log('INFO Stand '+name+': '+JSON.stringify(r));
   ok('['+name+'] Der Stand liegt im Brett unten rechts', r.sichtbar===true&&r.imBrett===true, JSON.stringify(r));
   ok('['+name+'] Und verdeckt keine Murmel des Kreuzes', r.deckt===false);
   ok('['+name+'] Er kostet keine Brettflaeche', r.brett===r.brettVorher, r.brettVorher+' / '+r.brett);
   ok('['+name+'] Er ist gross genug zum Treffen', r.treffH>=44&&r.treffB>=44, 'sichtbar '+r.breite+'x'+r.hoehe+', Treffer '+r.treffB+'x'+r.treffH);
   await ps.close();
 }

 /* Der Sockel legt nur den Schutzrand drauf, der nicht ohnehin schon unter
    dem Viewport liegt. Geprueft in beiden Lagen: Viewport = Bildschirm
    (Home-Bildschirm-App) und Viewport kuerzer (Safari mit Leiste). */
 {
   const pr=await browser.newPage(); await pr.setViewport({width:393,height:852});
   await pr.goto(url,{waitUntil:'load'}); await sleep(2300);
   const r=await pr.evaluate(()=>{
     const w=document.documentElement;
     w.style.setProperty('--sab','34px');
     const lies=()=>parseFloat(getComputedStyle(w).getPropertyValue('--sockelrand'))||0;
     // 1. Viewport so hoch wie der Bildschirm: voller Schutzrand noetig
     const echteHoehe=window.innerHeight;
     Object.defineProperty(screen,'height',{value:echteHoehe,configurable:true});
     sockelRandSetzen(); const voll=lies();
     // 2. Bildschirm 59 pt hoeher als der Viewport: der Streifen reicht schon
     Object.defineProperty(screen,'height',{value:echteHoehe+59,configurable:true});
     sockelRandSetzen(); const knapp=lies();
     // 3. Bildschirm viel hoeher: trotzdem nie null
     Object.defineProperty(screen,'height',{value:echteHoehe+300,configurable:true});
     sockelRandSetzen(); const extrem=lies();
     Object.defineProperty(screen,'height',{value:echteHoehe,configurable:true});
     sockelRandSetzen();
     return {voll,knapp,extrem}; });
   console.log('INFO Sockelrand: '+JSON.stringify(r));
   ok('Voller Schutzrand, wenn der Viewport den Bildschirm fuellt',
      Math.abs(r.voll-34)<0.6, r.voll+' px');
   ok('Weniger Schutzrand, wenn darunter ohnehin Platz ist',
      Math.abs(r.knapp-2)<0.6, r.knapp+' px bei 59 px Luecke');
   ok('Der Rand faellt nie auf null', r.extrem>=2, r.extrem+' px');
   await pr.close();
 }

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

 /* Lektionen: das Brett darf durch die Lektionsleiste nicht zusammenfallen.
    Lutz am 17.09.2026: "Da ist aber manchmal das Spielfeld extrem klein."
    Gemessen vor v1.56 auf einem iPhone in Safari mit Leisten: 228 statt
    366 px Brettbreite, also 61 % weniger Flaeche. Drei Ursachen:
    (1) der ausfuehrliche Erklaertext stand ganz in der Leiste,
    (2) die Reserve in fitStage war die feste Zahl 230 statt einer Messung,
    (3) stageShrink waechst nur und wurde beim Wechsel ins Lektions-Layout
        nie geleert - gemessen 108 px, die ungenutzt blieben. */
 for(const g of [[390,844,'iPhone 14 Pro'],[390,730,'Safari mit Leisten'],[375,667,'iPhone SE']]){
   const p=await browser.newPage(); await p.setViewport({width:g[0],height:g[1],isMobile:true,hasTouch:true});
   await p.goto(url,{waitUntil:'load'}); await sleep(2400);
   const normal=await p.evaluate(()=>Math.round(document.getElementById('board').getBoundingClientRect().width));
   for(const id of ['dreier','partie']){
     const r=await p.evaluate(async(lid)=>{ startLesson(lid); await new Promise(r=>setTimeout(r,800));
       const tb=document.querySelector('.toolbar').getBoundingClientRect();
       const bar=document.getElementById('lessonBar').getBoundingClientRect();
       const app=document.getElementById('app');
       const unten=app.getBoundingClientRect().bottom-parseFloat(getComputedStyle(app).paddingBottom||0);
       return {brett:Math.round(document.getElementById('board').getBoundingClientRect().width),
         raus:Math.round(Math.max(0,tb.bottom-unten)),
         verdeckt:Math.round(Math.max(0,bar.bottom-tb.top)),
         ringe:document.querySelectorAll('#board .pkg-ring').length+document.querySelectorAll('#board .cat-ring').length,
         zeilen:Math.round(document.getElementById('lessonText').getBoundingClientRect().height)}; },id);
     const name=g[2]+' / '+id;
     console.log('INFO Lektion '+name+': '+JSON.stringify(r)+' (normal '+normal+')');
     /* Mindestens die Haelfte der normalen Brettbreite - vorher waren es auf
        dem iPhone SE 154 von 316, also 49 %, und in Safari 62 %. */
     ok('Brett bleibt in der Lektion brauchbar gross ('+name+')',
        r.brett>=Math.round(normal*0.55), r.brett+' von '+normal+' px');
     ok('Fussleiste bleibt im Bild ('+name+')', r.raus===0, r.raus+' px heraus');
     ok('Die Lektionsleiste verdeckt die Fussleiste nicht ('+name+')', r.verdeckt===0, r.verdeckt+' px');
     /* Die Umrandung der Purges muss da sein - sie ist der Zweck der Lektion. */
     ok('Paket und Hilfsstein sind umrandet ('+name+')', r.ringe>=2, r.ringe+' Ringe');
     /* Der Text in der Leiste bleibt bei hoechstens zwei Zeilen. */
     ok('Der Text in der Leiste bleibt kurz ('+name+')', r.zeilen<=42, r.zeilen+' px hoch');
   }
   /* Wie gross ist die Trefferflaeche eines Feldes wirklich? Bis v1.56
      entschied das getroffene Element - ein Kreis mit R_HOLE+8. Gemessen auf
      dem iPhone in Safari: 21 px in der Lektion, dazwischen 11 px, in denen
      ein Tipp NICHTS traf (Lutz am 17.09.2026: "Ich klicke die Steine
      manchmal an und es passiert nichts"). Apple verlangt 44 pt.
      Gemessen wird der kleinste Versatz in acht Richtungen, bei dem noch
      dasselbe Feld gemeint ist - nicht der Radius irgendeines Kreises. */
   const treffer=await p.evaluate(()=>{
     const bd=document.getElementById('board').getBoundingClientRect();
     const lay=game.lay, vb=boardSvg.getAttribute('viewBox').split(/\s+/).map(Number);
     const sk=bd.width/vb[2]; const mitte=Math.floor(game.board.n/2);
     const cx=bd.left+(lay.pos[mitte].x-vb[0])*sk, cy=bd.top+(lay.pos[mitte].y-vb[1])*sk;
     let minR=99;
     for(let a=0;a<8;a++){ const w=a*Math.PI/4; let r=0;
       for(;r<60;r++){ if(feldAn({clientX:cx+Math.cos(w)*r, clientY:cy+Math.sin(w)*r})!==mitte) break; }
       if(r<minR) minR=r; }
     /* Und: gibt es irgendwo auf dem Brett einen Punkt ohne Feld? */
     /* Das Raster muss RELATIV zum Feldabstand sein: feste 14 px liegen auf
        einem Brett mit 21 px Rasterabstand schon ausserhalb jeder Zelle, und
        der Test meldete acht solcher Punkte als "tote Zone" - ein Fehler im
        Test, nicht im Code. Abgetastet wird die halbe Strecke zum Nachbarn,
        also genau die Flaeche, die dem Feld zusteht. */
     const Pp=Math.hypot(lay.pos[1].x-lay.pos[0].x,lay.pos[1].y-lay.pos[0].y)*sk;
     let ohne=0, gesamt=0; const schritt=Pp/4;
     for(let i=0;i<game.board.n;i++)
       for(let a2=-2;a2<=2;a2++) for(let b2=-2;b2<=2;b2++){
         gesamt++;
         if(feldAn({clientX:bd.left+(lay.pos[i].x-vb[0])*sk+a2*schritt, clientY:bd.top+(lay.pos[i].y-vb[1])*sk+b2*schritt})<0) ohne++; }
     /* Der Rasterabstand in px ist die Obergrenze: mehr als die halbe Strecke
        zum Nachbarn KANN ein Feld nicht bekommen, ohne ihm etwas wegzunehmen.
        Gefragt ist also nicht eine absolute Pixelzahl, sondern ob das Feld
        seine Voronoi-Zelle wirklich ausschoepft. */
     const P2=Math.hypot(lay.pos[1].x-lay.pos[0].x,lay.pos[1].y-lay.pos[0].y)*sk;
     return {px:+(minR*2).toFixed(1), raster:+P2.toFixed(1), gesamt, ohne};
   });
   console.log('INFO Trefferflaeche ('+g[2]+'): '+JSON.stringify(treffer));
   ok('Ein Feld schoepft seine Flaeche aus ('+g[2]+')', treffer.px>=treffer.raster*0.85,
      treffer.px+' px bei '+treffer.raster+' px Rasterabstand');
   ok('Keine toten Zonen zwischen den Feldern ('+g[2]+')', treffer.ohne===0,
      treffer.ohne+' von '+treffer.gesamt+' Punkten ohne Feld');

   /* Der ausfuehrliche Text ist nicht verloren: er steht im Blatt. */
   const blatt=await p.evaluate(()=>{ startLesson('partie'); openDetail();
     const t=document.getElementById('detailText').textContent;
     const z=document.getElementById('detailZusatz').textContent; closeDetail(); return {t,z}; });
   ok('Die Einleitung steht im Blatt hinter dem Pfeil ('+g[2]+')',
      /sechs Abschnitte/.test(blatt.t)&&/Vormachen/.test(blatt.z), blatt.t.slice(0,60));
   await p.close();
 }

 await p.close();
 await browser.close();
 console.log(fails?`\n${fails} FEHLER`:'\nLAYOUT-TESTS OK'); process.exitCode=fails?1:0;
})().catch(e=>{ console.error('CRASH',e); process.exit(1); });
