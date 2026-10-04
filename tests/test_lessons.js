const puppeteer=require(process.env.PUPPETEER_PATH||'puppeteer');
const path=require('path'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(n,c,x)=>{ console.log((c?'OK  ':'FAIL')+' '+n+(x!==undefined?' -> '+x:'')); if(!c) fails++; };
(async()=>{
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--allow-file-access-from-files']});
  const page=await browser.newPage(); await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('file://'+path.resolve(__dirname,'..','index.html'),{waitUntil:'load'}); await sleep(2600);
  const ids=await page.evaluate(()=>LESSONS.map(l=>l.id));
  for(const id of ids){
    await page.evaluate(id=>startLesson(id),id); await sleep(200);
    const st=await page.evaluate(()=>({bar:!document.getElementById('lessonBar').hidden,left:pegCount(),title:document.getElementById('lessonTitle').textContent,hint:document.getElementById('btnHint').disabled,endRings:document.querySelectorAll('#board .end-ring').length,pkg:document.querySelectorAll('#board .pkg-ring').length,cat:document.querySelectorAll('#board .cat-ring').length}));
    console.log('INFO '+id+': '+JSON.stringify(st));
    ok(id+': Lektion gestartet, Leiste sichtbar, Tipp aus', st.bar&&st.hint);
    // Vormachen bis gelöst (max 8 Abschnitte); freie Abschnitte ohne Zugfolge über den Solver lösen
    for(let k=0;k<8;k++){ const solved=await page.evaluate(()=>game.lesson.solved); if(solved) break;
      const free=await page.evaluate(()=>{ const {ph}=lessonPhase(); return !!(ph&&ph.free&&!ph.moves); });
      if(free){ await page.evaluate(()=>{ const [lo,hi]=CORE.fromArray(occ()); const r=CORE.solveSmart(game.board,lo,hi,pegCount(),{maxNodes:1e6,timeMs:5000,target:1}); game.line={key:stateKey(),path:r.path,best:1,complete:true,nodes:0,lb:1}; game.autoplay=true; playMove(game.board.moves[r.path[0]]); }); }
      else await page.click('#lsDemo');
      await sleep(400); await page.waitForFunction(()=>!game.autoplay&&!game.animating,{timeout:60000}); await sleep(200); }
    const fin=await page.evaluate(()=>({solved:game.lesson.solved,left:pegCount(),status:statusFullText(),text:document.getElementById('lessonText').textContent}));
    console.log('INFO '+id+' Ende: '+JSON.stringify(fin));
    ok(id+': Lektion per Vormachen geschafft', fin.solved);
  }
  /* v1.86: Das Endspiel der Partie ist selbst ein Purge - ein Haken (L aus
     sechs Steinen), Hilfsstein (3,4) springt nach unten hinaus und kehrt
     zurueck. Alle vier Loesungen des Endspiels haben genau diese Form
     (durchgezaehlt); zwei davon enden in der Mitte, die Lektion zeigt jetzt
     eine davon statt des Endes auf (3,6). */
  await page.evaluate(()=>startLesson('partie')); await sleep(300);
  const pa=await page.evaluate(()=>{ const L=LESSONS.find(x=>x.id==='partie'), B=game.board;
    const flaeche=document.querySelector('#board .paketFlaeche');
    const lagen=[...boardSvg.children]; const iFl=flaeche?lagen.indexOf(flaeche.parentNode):-1, iSt=lagen.indexOf(pegsLayer);
    return {n:L.phases.length, ph6:L.phases[5], ph7:L.phases[6],
      flKreise:flaeche?flaeche.querySelectorAll('circle').length:0, flUnter:iFl>=0&&iFl<iSt,
      hof:document.querySelectorAll('#board .pkg-hof').length, catHof:document.querySelectorAll('#board .cat-hof').length,
      ringe:document.querySelectorAll('#board .pkg-ring').length}; });
  console.log('INFO Partie v1.86: '+JSON.stringify({n:pa.n,flKreise:pa.flKreise,flUnter:pa.flUnter,hof:pa.hof,catHof:pa.catHof,ringe:pa.ringe}));
  ok('Partie: sieben Abschnitte', pa.n===7, String(pa.n));
  ok('Abschnitt 6 ist der Haken-Purge mit Hilfsstein (3,4)',
     pa.ph6.cat==='3,4'&&pa.ph6.pkg.length===6&&pa.ph6.moves.length===6&&!pa.ph6.free, JSON.stringify(pa.ph6.pkg));
  ok('Abschnitt 7 springt in die Mitte', pa.ph7.moves.length===1&&pa.ph7.moves[0][1]==='3,3', JSON.stringify(pa.ph7.moves));
  ok('Paket: Flaeche hinter jedem Stein, unter den Steinen', pa.flKreise===3&&pa.flUnter===true, pa.flKreise+' / '+pa.flUnter);
  ok('Paket und Hilfsstein haben einen dunklen Hof', pa.hof===pa.ringe&&pa.ringe===3&&pa.catHof===1, pa.hof+'/'+pa.ringe+'/'+pa.catHof);
  /* Sieht man es? Brett mit gegen ohne Markierung, gezaehlt im Kasten um
     das Paket - nicht die Zahl der Elemente (Fehlertyp v1.39). */
  const box=await page.evaluate(()=>{ const r=boardSvg.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; });
  const {PNG}=require('pngjs');
  const mit=PNG.sync.read(await page.screenshot({clip:box}));
  await page.evaluate(()=>document.querySelectorAll('#board .paketFlaeche,#board .pkg-ring,#board .pkg-hof').forEach(e=>e.style.display='none'));
  const ohne=PNG.sync.read(await page.screenshot({clip:box}));
  let anders=0; for(let i=0;i<mit.data.length;i+=4){ const d=Math.abs(mit.data[i]-ohne.data[i])+Math.abs(mit.data[i+1]-ohne.data[i+1])+Math.abs(mit.data[i+2]-ohne.data[i+2]); if(d>60) anders++; }
  console.log('INFO Paket-Markierung: '+anders+' deutlich veraenderte Bildpunkte');
  /* Gemessen: v1.85 (duenne Striche) 1226, v1.86 8745. Schwelle 4000 = mehr
     als das Dreifache des alten Standes - die alte Fassung faellt sicher
     durch, die neue hat Abstand nach unten. */
  ok('Die Paket-Markierung ist deutlich zu sehen', anders>4000, String(anders));
  /* v1.87: "Beenden" war ein Geisterknopf ohne eigenen Grund - die Schrift
     stand direkt auf dem Holz, 4,0 : 1 im schlechtesten Zehntel (Lutz,
     03.10.2026: "kann man kaum lesen"). Gemessen wird die Schrift gegen die
     Bildpunkte, die wirklich hinter ihr liegen (Schrift unsichtbar, 90.
     Perzentil der Helligkeit), fuer alle drei Knoepfe der Leiste. */
  await page.evaluate(()=>{ closeSheet&&closeSheet(); startLesson('partie'); }); await sleep(400);
  const linK=c=>{c/=255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4}, Lum=(R,G,B)=>.2126*linK(R)+.7152*linK(G)+.0722*linK(B);
  for(const id of ['lsDemo','lsRestart','lsQuit']){
    const q=await page.evaluate(id=>{ const e=document.getElementById(id), r=e.getBoundingClientRect();
      const oben=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {x:r.x,y:r.y,width:r.width,height:r.height,farbe:getComputedStyle(e).color,oben:oben===e||e.contains(oben)}; },id);
    await page.evaluate(id=>document.getElementById(id).style.color='transparent',id);
    const bild=PNG.sync.read(await page.screenshot({clip:{x:q.x,y:q.y,width:q.width,height:q.height}}));
    await page.evaluate(id=>document.getElementById(id).style.color='',id);
    const ls=[]; for(let i=0;i<bild.data.length;i+=4) ls.push(Lum(bild.data[i],bild.data[i+1],bild.data[i+2])); ls.sort((a,b)=>a-b);
    const [R,G,B]=q.farbe.match(/\d+/g).map(Number), lt=Lum(R,G,B), l90=ls[Math.floor(ls.length*.9)];
    const k=(Math.max(lt,l90)+.05)/(Math.min(lt,l90)+.05);
    console.log('INFO Leiste '+id+': Schrift '+q.farbe+', Kontrast schlechtestes Zehntel '+k.toFixed(2)+' : 1, obenauf '+q.oben);
    ok('Lektionsleiste: „'+id+'" ist lesbar (≥ 4,5 : 1 gegen das, was dahinter liegt)', q.oben&&k>=4.5, k.toFixed(2)+' : 1');
  }
  // Ganze Partie vormachen: endet mit einem Stein in der Mitte
  await page.evaluate(()=>startLesson('partie')); await sleep(200);
  for(let k=0;k<8;k++){ if(await page.evaluate(()=>game.lesson.solved)) break; await page.click('#lsDemo');
    await sleep(400); await page.waitForFunction(()=>!game.autoplay&&!game.animating,{timeout:60000}); await sleep(200); }
  const pe=await page.evaluate(()=>({solved:game.lesson.solved,left:pegCount(),mitte:game.pegAt[game.board.index['3,3']]>=0}));
  ok('Partie vorgemacht: ein Stein, und zwar in der Mitte', pe.solved&&pe.left===1&&pe.mitte, JSON.stringify(pe));
  /* v1.88: Der Haken-Purge als eigene Lektion (Lutz, 04.10.2026: "als eigenen
     Purge einbauen, neben den anderen"). Steht bei den Purges, vor den
     Endfeldern und der Partie; von Hand gespielt bleibt genau der
     Hilfsstein auf seinem Feld (3,4) stehen. */
  const hk=await page.evaluate(()=>{ const i=LESSONS.findIndex(l=>l.id==='haken'); return {i,titel:i>=0?LESSONS[i].title:'',reihe:LESSONS.map(l=>l.id).join(',')}; });
  ok('Haken-Purge ist Lektion 4, direkt nach dem Neuner', hk.i===3&&/^4 · Haken-Purge$/.test(hk.titel), hk.reihe+' / '+hk.titel);
  await page.evaluate(()=>{ closeSheet&&closeSheet(); startLesson('haken'); }); await sleep(300);
  const hkStart=await page.evaluate(()=>({steine:pegCount(),ringe:document.querySelectorAll('#board .pkg-ring').length,kat:document.querySelectorAll('#board .cat-ring').length}));
  ok('Haken: sieben Steine, sechs im Paket, ein Hilfsstein', hkStart.steine===7&&hkStart.ringe===6&&hkStart.kat===1, JSON.stringify(hkStart));
  const hkMv=await page.evaluate(()=>resolveMoves(LESSONS.find(l=>l.id==='haken').phases[0].moves).map(m=>game.board.moves.indexOf(m)));
  for(const mi of hkMv){ await page.evaluate(i=>playMove(game.board.moves[i]),mi); await sleep(400); }
  const hkEnde=await page.evaluate(()=>({solved:game.lesson.solved,steine:pegCount(),aufFeld:game.pegAt[game.board.index['3,4']]>=0}));
  ok('Haken von Hand: geschafft, nur der Hilfsstein bleibt auf (3,4)', hkEnde.solved&&hkEnde.steine===1&&hkEnde.aufFeld, JSON.stringify(hkEnde));
  // Lektion 1 manuell: richtige Züge -> geschafft; falscher Weg -> Hinweis
  await page.evaluate(()=>startLesson('dreier')); await sleep(200);
  const mv=await page.evaluate(()=>resolveMoves(LESSONS[0].phases[0].moves).map(m=>game.board.moves.indexOf(m)));
  for(const mi of mv){ await page.evaluate(i=>playMove(game.board.moves[i]),mi); await sleep(400); }
  ok('Dreier manuell: geschafft', await page.evaluate(()=>game.lesson.solved));
  await page.evaluate(()=>startLesson('dreier')); await sleep(200);
  await page.evaluate(()=>{ playMove(resolveMoves([['2,2','4,2']])[0]); }); await sleep(400);
  await page.evaluate(()=>{ playMove(resolveMoves([['3,3','3,1']])[0]); }); await sleep(400);
  await page.evaluate(()=>{ const m=game.board.moves.find(m=>game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0); if(m) playMove(m); }); await sleep(400);
  const wrong=await page.evaluate(()=>({status:statusFullText(),solved:game.lesson.solved}));
  console.log('INFO falscher Weg: '+JSON.stringify(wrong));
  ok('Dreier falscher Weg: nicht geschafft', !wrong.solved);
  // Zurück nach „geschafft": Lektion wieder offen
  await page.evaluate(()=>startLesson('dreier')); await sleep(200);
  for(const mi of mv){ await page.evaluate(i=>playMove(game.board.moves[i]),mi); await sleep(400); }
  ok('erneut geschafft', await page.evaluate(()=>game.lesson.solved));
  await page.evaluate(()=>undo()); await sleep(1500); await page.waitForFunction(()=>!game.animating,{timeout:10000});
  ok('nach Zurück wieder offen, Text = Aufgabe', await page.evaluate(()=>!game.lesson.solved&&!document.getElementById('lsDemo').disabled&&/Führe den Dreier-Purge/.test(document.getElementById('lessonText').textContent)));
  await page.evaluate(()=>redo()); await sleep(1500); await page.waitForFunction(()=>!game.animating,{timeout:10000});
  ok('nach Vor erneut geschafft', await page.evaluate(()=>game.lesson.solved));
  await page.evaluate(()=>startLesson('dreier')); await sleep(200);
  await page.click('#lsRestart'); await sleep(200); ok('Abschnitt neu: Ausgangsstellung', await page.evaluate(()=>pegCount()===4&&game.history.length===0));
  await page.click('#lsQuit'); await sleep(200); ok('Beenden: normales Spiel', await page.evaluate(()=>!game.lesson&&document.getElementById('lessonBar').hidden&&pegCount()===32));
  await page.click('#btnMenu'); await sleep(400); ok('Lektionen im Menü', (await page.$$('#lessonList .chip')).length===6); await page.screenshot({path:'shot_menu_lessons.png'});
  ok('keine Seitenfehler', errors.length===0, errors.join(' | '));
  await page.evaluate(()=>{ closeSheet(); startLesson('partie'); }); await sleep(300); await page.screenshot({path:'shot_lesson5.png'});
  await browser.close(); console.log(fails?`\n${fails} FEHLER`:'\nLEKTIONS-TESTS OK'); process.exitCode=fails?1:0;
})().catch(e=>{ console.error('CRASH',e); process.exit(1); });
