const puppeteer=require(process.env.PUPPETEER_PATH||'puppeteer');
const path=require('path');
const {PNG}=require('pngjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(name,cond,extra)=>{ console.log((cond?'OK  ':'FAIL')+' '+name+(extra!==undefined?' -> '+extra:'')); if(!cond) fails++; };
/* Vergleicht die Kurzfassung einer Probe mit dem erwarteten Wortlaut. */
function kurzfassungGleich(proben,voll,erwartet){
  const x=proben.find(p=>p.voll===voll); return !!x&&x.kurz===erwartet;
}
(async()=>{
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--allow-file-access-from-files']});
  const page=await browser.newPage();
  await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errors=[]; let abschnitt='Start';
  page.on('pageerror',e=>errors.push('pageerror bei "'+abschnitt+'": '+e.message+(e.stack?' | '+String(e.stack).split('\n').slice(0,3).join(' / '):''))); page.on('console',m=>{ if(m.type()==='error') errors.push('console: '+m.text()); });
  await page.goto('file://'+path.resolve(__dirname,'..','index.html'),{waitUntil:'load'});
  await sleep(300); await page.screenshot({path:'shot_splash.png'});
  await sleep(2600); await page.screenshot({path:'shot_game.png'});
  // Die Versionsnummer steht im Startbild und im Menue - und beide sagen dasselbe.
  const ver=await page.evaluate(()=>({app:typeof APP_VERSION!=='undefined'?APP_VERSION:null,
    splash:(document.getElementById('splashVersion')||{}).textContent||''}));
  console.log('INFO Version: '+JSON.stringify(ver));
  ok('Startbild nennt die Version', ver.splash==='Version '+ver.app, JSON.stringify(ver));
  ok('Splash ausgeblendet nach 2 s', await page.$eval('#splash',e=>e.hidden||getComputedStyle(e).opacity==='0'));
  ok('keine Seitenfehler beim Laden', errors.length===0, errors.join(' | '));

  // helper: client coords of cell i
  const cellXY=async i=>page.evaluate(i=>{ const p=game.lay.pos[i]; const m=boardSvg.getScreenCTM(); return {x:m.a*p.x+m.c*p.y+m.e, y:m.b*p.x+m.d*p.y+m.f}; },i);
  const state=async()=>page.evaluate(()=>({moves:game.history.length,left:pegCount(),status:statusFullText(),finished:game.finished,sel:game.selected,anim:game.animating}));
  // Die Aktionen stehen seit der Ampel-Zeile im Blatt: Zeile antippen, dann
  // dort den Knopf druecken - derselbe Weg, den ein Spieler nimmt.
  const aktion=async(teil)=>{
    await page.click('#status'); await sleep(350);
    const getroffen=await page.evaluate(t=>{
      const b=[...document.querySelectorAll('#detailAktionen .btn')].find(x=>x.textContent.includes(t));
      if(!b) return false; b.click(); return true; },teil||'');
    // Das Blatt darf nie offen zurueckbleiben, sonst faengt sein Hintergrund
    // alle folgenden Klicks ab und der naechste Pruefpunkt scheitert grundlos.
    await page.evaluate(()=>closeDetail()); await sleep(250);
    if(!getroffen) console.log('FAIL Aktion "'+teil+'" nicht im Blatt gefunden');
    return getroffen;
  };
  const tap=async i=>{ const c=await cellXY(i); await page.mouse.click(c.x,c.y); await sleep(380); };
  const swipe=async(i,dx,dy)=>{ const c=await cellXY(i); await page.mouse.move(c.x,c.y); await page.mouse.down(); await page.mouse.move(c.x+dx*0.5,c.y+dy*0.5); await page.mouse.move(c.x+dx,c.y+dy); await page.mouse.up(); await sleep(380); };

  // English board: centre (3,3) empty. Cell index of (1,3) is 4 -> exactly one legal move (down into centre).
  const idx=async(r,c)=>page.evaluate((r,c)=>game.board.index[r+','+c],r,c);
  const i13=await idx(1,3), i33=await idx(3,3), i31=await idx(3,1), i35=await idx(3,5), i53=await idx(5,3);
  let s=await state(); ok('Start: 32 Steine, 0 Sprünge', s.left===32&&s.moves===0, JSON.stringify(s));
  await tap(i13); s=await state();
  ok('Auto-Sprung bei eindeutigem Zug (1,3)->(3,3)', s.moves===1&&s.left===31, JSON.stringify(s));
  ok('Stein steht jetzt im Zentrum', await page.evaluate(i=>game.pegAt[i]>=0,i33));
  // now (2,3) and (1,3) empty. Peg at (3,1)?? legal: (3,1) cannot jump. Peg (4,3): jump up over (3,3) into (2,3). Peg at (2,1): jump right over (2,2) into (2,3)! Peg at (2,5): jump left into (2,3). Peg (0,3): jump down into (2,3)... wait (1,3) is empty so no.
  // Tap a peg with no legal move -> shake, no move
  await tap(i31); s=await state(); ok('Stein ohne Zug: kein Sprung, Fehlermeldung', s.moves===1&&/nicht springen/.test(s.status), s.status);
  // Peg (2,1): moves: right over (2,2) to (2,3). Only one? (2,1) up: (1,1) not a cell. down: (3,1)->(4,1) occupied. So exactly one -> autojump
  const i21=await idx(2,1); await tap(i21); s=await state(); ok('Zweiter Auto-Sprung (2,1)->(2,3)', s.moves===2&&s.left===30, JSON.stringify(s));
  // undo/redo
  await page.click('#btnUndo'); await sleep(1300); s=await state(); ok('Rückgängig', s.moves===1&&s.left===31, JSON.stringify(s));
  await page.click('#btnRedo'); await sleep(1400); s=await state(); ok('Wiederholen', s.moves===2&&s.left===30, JSON.stringify(s));
  // Swipe test: find a peg with >=2 legal moves
  await page.evaluate(()=>{ const b=game.board; for(let i=0;i<b.n;i++) game.pegAt[i]=-1; ['3,3','3,4','3,2','2,3','4,3'].forEach((k,j)=>game.pegAt[b.index[k]]=j); game.history=[]; game.future=[]; game.selected=-1; render(); });
  const multi=await page.evaluate(()=>{ for(let i=0;i<game.board.n;i++){ if(game.pegAt[i]>=0&&legalMovesFrom(i).length>=2) return {i,moves:legalMovesFrom(i).map(m=>({to:m.to}))}; } return null; });
  ok('Stein mit mehreren Zügen vorhanden', !!multi);
  if(multi){
    await tap(multi.i); s=await state(); ok('Mehrdeutig (4 Züge): nur Auswahl, kein Sprung', s.moves===0&&s.sel===multi.i&&multi.moves.length===4, JSON.stringify(s));
    const a=await cellXY(multi.i), b=await cellXY(multi.moves[1].to);
    await swipe(multi.i,(b.x-a.x)*0.6,(b.y-a.y)*0.6); s=await state();
    ok('Wischen in Richtung des 2. Ziels führt den Sprung aus', s.moves===1&&(await page.evaluate(t=>game.pegAt[t]>=0,multi.moves[1].to)), JSON.stringify(s));
  }
  // Wrong-direction swipe
  const any=await page.evaluate(()=>{ for(let i=0;i<game.board.n;i++){ if(game.pegAt[i]>=0&&legalMovesFrom(i).length===1) return i; } return -1; });
  if(any>=0){ const m=await page.evaluate(i=>{ const m=legalMovesFrom(i)[0]; const a=game.lay.pos[m.from], b=game.lay.pos[m.to]; return {dx:b.x-a.x,dy:b.y-a.y}; },any);
    const before=(await state()).moves; await swipe(any,-m.dx*0.4,-m.dy*0.4); s=await state(); ok('Falsche Wischrichtung: kein Sprung', s.moves===before&&/Richtung/.test(s.status), s.status); }
  // Hint (frisches Spiel, zwei Züge gespielt)
  await page.evaluate(()=>newGame('english')); await tap(i13); await tap(i21);
  await page.click('#btnHint'); await sleep(100);
  await page.waitForFunction(()=>!game.searching,{timeout:20000}); await sleep(100);
  s=await state(); const hint=await page.evaluate(()=>{ const l=currentLine(); return l&&{best:l.best,complete:l.complete,len:l.path.length,nodes:l.nodes,book:!!l.book,worker:!!worker,broken:workerBroken,on:game.hintOn}; });
  ok('Tipp vorhanden (nach Abweichung vom Buch: echte Suche im Worker)', hint&&hint.on&&!hint.broken&&(hint.book||hint.worker), JSON.stringify(hint));
  ok('Tipp-Overlay sichtbar', await page.$eval('#board',e=>!!e.querySelector('.hint-arrow')));
  console.log('INFO Tipp-Status: '+s.status);
  await page.screenshot({path:'shot_hint.png'});
  if(hint&&hint.complete&&hint.best===1){
    // play the recommended move manually (tap the hinted peg + tap target) and verify hint cache follows
    const mv=await page.evaluate(()=>{ const m=game.board.moves[currentLine().path[0]]; return {from:m.from,to:m.to,n:legalMovesFrom(m.from).length}; });
    await page.evaluate(()=>{ game.selected=-1; renderOverlay(); }); await tap(mv.from); if(mv.n>1) await tap(mv.to); s=await state();
    const cached=await page.evaluate(()=>!!currentLine()&&!game.hintOn&&!document.querySelector('#board .hint-arrow'));
    await page.click('#btnHint'); await sleep(150); const instant=await page.evaluate(()=>game.hintOn&&!game.searching&&!!document.querySelector('#board .hint-arrow'));
    ok('Nächster Tipp auf der Linie sofort (ohne Suche)', instant);
    ok('Empfohlener Zug gespielt: Pfeil weg, Linie bleibt bekannt', s.moves===3&&cached, JSON.stringify(s));
    // autoplay the rest
    await aktion('Rest automatisch');
    await page.waitForFunction(()=>game.finished,{timeout:60000}); await sleep(700);
    s=await state(); ok('Automatik spielt bis zum Ende: 1 Stein', s.finished&&s.left===1, JSON.stringify(s));
    ok('Ergebnisdialog sichtbar', await page.$eval('#resultModal',e=>e.classList.contains('on')));
    console.log('INFO Ergebnis: '+await page.$eval('#resTitle',e=>e.textContent)+' / '+await page.$eval('#resText',e=>e.textContent));
    await page.screenshot({path:'shot_result.png'});
    await page.click('#resNew'); await sleep(300); s=await state(); ok('Nochmal startet neu', s.moves===0&&s.left===32, JSON.stringify(s));
  }
  ok('keine Seitenfehler während des Spiels', errors.length===0, errors.join(' | '));

  // Every board: select via sheet, verify counts and solver reaches 1 from start via hint+autoplay
  const boardsInfo=await page.evaluate(()=>CORE.BOARD_DEFS.map(d=>({id:d.id,name:d.name,n:boards[d.id].n})));
  for(const b of boardsInfo){
    await page.evaluate(id=>newGame(id),b.id); await sleep(200);
    s=await state(); ok(`${b.name}: Start ${b.n-1} Steine`, s.left===b.n-1, JSON.stringify(s));
    await page.click('#btnHint'); await page.waitForFunction(()=>!game.searching,{timeout:30000}); await sleep(100);
    const h=await page.evaluate(()=>{ const l=currentLine(); return l&&{best:l.best,complete:l.complete,nodes:l.nodes,lb:l.lb,book:!!l.book}; });
    console.log(`INFO ${b.name}: Tipp -> ${JSON.stringify(h)} | ${(await state()).status}`);
    ok(`${b.name}: Lösung zu 1 Stein gefunden`, h&&h.best===1&&h.complete, JSON.stringify(h));
    await page.screenshot({path:`shot_board_${b.id}.png`});
    if(h&&h.best===1){ await aktion('Rest automatisch'); await page.waitForFunction(()=>game.finished,{timeout:90000}); await sleep(700); s=await state(); ok(`${b.name}: Automatik endet mit 1 Stein`, s.left===1, JSON.stringify(s)); await page.click('#resClose'); }
  }
  // Late-game exactness check: European centre-vacant position is provably not solvable to 1 (parity) -> hint must say "Bewiesen" with best 2
  await page.evaluate(()=>{ newGame('european'); const b=game.board; for(let i=0;i<b.n;i++) game.pegAt[i]=i; game.pegAt[b.centerIdx]=-1; game.initial=game.pegAt.slice(); game.startCount=pegCount(); render(); });
  const lb=await page.evaluate(()=>CORE.parityLowerBound(game.board,occ()));
  ok('Europäisch Mitte leer: Paritätsschranke 2', lb===2, lb);
  await page.click('#btnHint'); await page.waitForFunction(()=>!game.searching,{timeout:30000}); await sleep(100);
  s=await state(); const h2=await page.evaluate(()=>{ const l=currentLine(); return l&&{best:l.best,complete:l.complete}; });
  console.log('INFO Europäisch Mitte: '+s.status);
  ok('Europäisch Mitte: Tipp meldet bewiesen bestenfalls 2', h2&&h2.best===2&&h2.complete, JSON.stringify(h2));

  // Suche ohne Buch (Europäisch Start): entweder 1 gefunden oder ehrliche Meldung
  await page.evaluate(()=>{ newGame('european'); game.bookLine=null; }); await page.click('#btnHint'); await page.waitForFunction(()=>!game.searching,{timeout:40000}); await sleep(100);
  s=await state(); const h3=await page.evaluate(()=>{ const l=currentLine(); return l&&{best:l.best,complete:l.complete,nodes:l.nodes}; });
  console.log('INFO Europäisch ohne Buch: '+JSON.stringify(h3)+' | '+s.status);
  ok('Europäisch ohne Buch: Ergebnis vorhanden und ehrlich beschriftet', h3&&((h3.complete&&/sicher|Bewiesen/.test(s.status))||(!h3.complete&&/Bisher bester Zug|Abgebrochen/.test(s.status))));
  // Fortschritt + Abbruch bei großem Budget (Screenshot-Stellung von Lutz)
  await page.evaluate(()=>{ newGame('wiegleb'); const b=game.board; for(let k=0;k<4;k++){ const mv=b.moves.filter(m=>game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0); applyMove(mv[Math.floor(mv.length/2)],true); } game.bookLine=null; render(); settings.budget=50; });
  await page.click('#btnHint'); await sleep(700);
  ok('Erst kurzer Text ohne Abbrechen', await page.evaluate(()=>statusFullText()==='Rechne…'));
  await sleep(1200);
  const prog=await page.evaluate(()=>statusFullText()); console.log('INFO Fortschritt: '+prog);
  ok('Nach 1,5 s Fortschritt mit Abbrechen-Link', /Rechne…/.test(prog)&&/Stellungen/.test(prog)&&/Abbrechen/.test(prog)&&(await page.evaluate(()=>lastSearchWhere==='Hintergrund')));
  const cancelled=await page.evaluate(()=>{ const l=statusEl.querySelector('.link'); if(!l) return false; l.click(); return true; });
  await page.waitForFunction(()=>!game.searching,{timeout:15000}); await sleep(100);
  s=await state(); const h4=await page.evaluate(()=>{ const l=currentLine(); return l&&{best:l.best,complete:l.complete,cancelled:l.cancelled,nodes:l.nodes}; });
  console.log('INFO nach Abbruch: '+JSON.stringify(h4)+' | '+s.status);
  ok('Abbruch liefert besten bisherigen Zug, als unvollständig markiert', cancelled&&h4&&!h4.complete&&h4.nodes>0&&/Abgebrochen|sicher/.test(s.status));
  ok('Nach Abbruch: Autoplay- und Weiter-suchen-Link', await page.evaluate(()=>statusEl.querySelectorAll('.link').length===2));
  await page.evaluate(()=>{ newGame('english'); const b=game.board; for(let i=0;i<b.n;i++) game.pegAt[i]=i; ['2,3','2,5','3,4','4,3','4,4','5,3'].forEach(k=>game.pegAt[b.index[k]]=-1); game.bookLine=null; game.history=[{mi:0,jumped:0}]; game.startCount=32; render(); });
  ok('Screenshot-Stellung: 27 Steine', (await state()).left===27);
  await page.click('#btnHint'); await page.waitForFunction(()=>!game.searching,{timeout:120000}); await sleep(100);
  s=await state(); const h5=await page.evaluate(()=>{ const l=currentLine(); return l&&{best:l.best,complete:l.complete,nodes:l.nodes,ms:l.ms}; });
  console.log('INFO Screenshot-Stellung ohne Limit: '+JSON.stringify(h5)+' | '+s.status);
  ok('Suche ohne Limit: bewiesen 1 Stein', h5&&h5.best===1&&h5.complete);
  ok('Kein Wort Budget in der Statuszeile', !/Budget/.test(s.status));
  ok('Keine Suchtiefe-Auswahl mehr', (await page.$$('#budgetBarList .chip')).length===0&&(await page.$$('#budgetList .chip')).length===0);
  // HUD: Zahlen auf gleicher Höhe
  await page.evaluate(()=>{ newGame('english'); });
  const tops=await page.evaluate(()=>[...document.querySelectorAll('.hud b')].map(e=>Math.round(e.getBoundingClientRect().top)));
  ok('HUD-Zahlen auf gleicher Höhe', new Set(tops).size===1, JSON.stringify(tops));
  // kleine Zahlen ausgeschrieben
  await page.evaluate(()=>{ const b=game.board; for(let i=0;i<b.n;i++) game.pegAt[i]=-1; ['2,0','2,1','2,2','4,4','4,6','6,4'].forEach((k,j)=>game.pegAt[b.index[k]]=j); game.bookLine=null; game.line=null; game.history=[{mi:0,jumped:0}]; render(); });
  await page.click('#btnHint'); await page.waitForFunction(()=>!game.searching,{timeout:20000}); await sleep(100);
  const st2=await page.evaluate(()=>statusFullText()); console.log('INFO kleine Suche: '+st2);
  ok('Kleine Stellungszahl ausgeschrieben, keine 0,00 Mio.', !/0,00 Mio/.test(st2)&&/Stellungen/.test(st2));
  ok('Messwerte in eigener Zeile', await page.evaluate(()=>{ const n=statusEl.querySelector('.note'); return !!n&&/Stellungen/.test(n.textContent)&&!/Stellungen/.test(statusEl.firstChild.textContent); }));
  ok('HUD einzeilig: Übrig von N', await page.evaluate(()=>document.getElementById('hudLeftLabel').textContent==='Übrig von 32'&&!document.querySelector('.hud .sub')));
  // Trainer + Markierung
  await page.evaluate(()=>{ settings.computer=true; settings.marks=true; renderComputerBtn(); newGame('english'); });
  // dem Buch 12 Züge folgen (bleibt lösbar), dann bewerten lassen
  await page.evaluate(()=>{ for(let k=0;k<12;k++){ const l=currentLine(); applyMove(game.board.moves[l.path[0]],true); } render(); evaluatePosition(); });
  await page.waitForFunction(()=>!game.evaluating,{timeout:20000}); await sleep(100);
  s=await state(); console.log('INFO Trainer nach Buchzügen: '+s.status);
  ok('Computer: noch lösbar erkannt', /1 Stein ist (noch|weiterhin) erreichbar/.test(s.status));
  // jetzt einen Zug spielen, der 1 verhindert: alle Züge durchprobieren, bis der Trainer "gekostet" meldet
  const legal=await page.evaluate(()=>game.board.moves.map((m,i)=>({i,ok:game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0})).filter(x=>x.ok).map(x=>x.i));
  let lostMsg=null;
  for(const mi of legal){ await page.evaluate(i=>{ applyMove(game.board.moves[i],true); render(); afterMove(true); },mi);
    await page.waitForFunction(()=>!game.evaluating,{timeout:20000}); await sleep(100); s=await state();
    if(/gekostet|Strategischer Fehler/.test(s.status)){ lostMsg=s.status; break; } await page.evaluate(()=>undo()); await sleep(1200); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000}); }
  console.log('INFO Trainer Fehlzug: '+lostMsg);
  // Zurück, Zurück, Vor, Vor: beim zweiten Vor muss wieder „gekostet" stehen
  await page.evaluate(()=>undo()); await sleep(1200); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000});
  await page.evaluate(()=>undo()); await sleep(1200); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000});
  await page.evaluate(()=>redo()); await sleep(1200); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000}); await sleep(100); const s1=(await state()).status;
  await page.evaluate(()=>redo()); await sleep(1200); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000}); await sleep(100); const s2=(await state()).status;
  console.log('INFO Vorspulen: 1) '+s1+' | 2) '+s2);
  ok('Vorspulen: erst grün, dann „gekostet"', /(noch|weiterhin) erreichbar/.test(s1)&&/gekostet|Strategischer Fehler/.test(s2));
  // Reihenfolge: erst Markierung, dann Sprung
  await page.evaluate(()=>undo()); await sleep(1500); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000});
  const before=await page.evaluate(()=>game.history.length);
  await page.evaluate(()=>redo()); await sleep(150);
  const early=await page.evaluate(()=>({arrow:!!document.querySelector('#board path[marker-end="url(#arrowHeadWhite)"]'),moved:game.history.length,anim:game.animating}));
  await sleep(1500); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000});
  ok('Vor: Markierung steht vor dem Sprung', early.arrow&&early.moved===before&&early.anim, JSON.stringify(early));
  const spool=await page.evaluate(()=>({last:!!game.lastMove, red:!!document.querySelector('#board path[marker-end="url(#arrowHeadRed)"]'), white:!!document.querySelector('#board path[marker-end="url(#arrowHeadWhite)"]')}));
  console.log('INFO Spul-Markierung: '+JSON.stringify(spool));
  ok('Fehlzug beim Vorspulen rot markiert', spool.last&&spool.red&&!spool.white);
  await page.evaluate(()=>undo()); await sleep(1200); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000});
  const spool2=await page.evaluate(()=>({white:!!document.querySelector('#board path[marker-end="url(#arrowHeadWhite)"]'), red:!!document.querySelector('#board path[marker-end="url(#arrowHeadRed)"]')}));
  ok('Zurückspulen: neutrale Markierung', spool2.white&&!spool2.red);
  const und=await page.evaluate(()=>{ const m=game.board.moves[game.lastMove.mi]; const p=game.lay.pos; const arrow=document.querySelector('#board path[marker-end="url(#arrowHeadWhite)"]').getAttribute('d'); const seg=arrow.match(/M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)/).slice(1).map(Number);
    const towardsTo=Math.hypot(seg[2]-p[m.to].x,seg[3]-p[m.to].y)<Math.hypot(seg[2]-p[m.from].x,seg[3]-p[m.from].y); return {towardsTo, back:!!document.querySelector('#board .back-ring'), status:statusFullText()}; });
  console.log('INFO Zurück-Anzeige: '+JSON.stringify(und));
  ok("Zurück: Markierung zeigt den Zug, Ring am wieder aufgetauchten Stein, Zählung ab 1", und.towardsTo&&und.back&&/Zug \d+ von/.test(und.status)&&!/Zug 0 von/.test(und.status));
  await page.screenshot({path:'shot_spool.png'});
  ok('Erklaerung meldet den verlorenen Zug mit Zug-zurueck-Knopf', !!lostMsg&&/Zug zurück/.test(lostMsg));
  // Markierung: konstruierte Stellung mit gestrandetem Stein (0,2)
  await page.evaluate(()=>{ const b=game.board; for(let i=0;i<b.n;i++) game.pegAt[i]=-1; ['0,2','3,2','3,3','3,4','3,5','3,6'].forEach((k,j)=>game.pegAt[b.index[k]]=j); game.history=[{mi:0,jumped:0}]; game.evalRes=null; render(); evaluatePosition(); });
  await page.waitForFunction(()=>!game.evaluating,{timeout:20000}); await sleep(150);
  const marks=await page.evaluate(()=>{ const ev=game.evalRes; const i=game.board.index['0,2']; let never=0; for(let c=0;c<game.board.n;c++){ if(game.pegAt[c]>=0&&ev&&ev.optFinal&&((c<32?(ev.optFinal.mask[0]>>>c):(ev.optFinal.mask[1]>>>(c-32)))&1)) never++; } return {n:document.querySelectorAll('#board path[stroke="#e2a95c"]').length, never, stranded02: ev&&ev.optFinal&&!!((ev.optFinal.mask[0]>>>i)&1), complete:ev&&ev.complete, full:ev&&ev.full}; });
  console.log('INFO Markierung: '+JSON.stringify(marks));
  ok('Gestrandete Steine markiert, (0,2) darunter', marks.n===marks.never&&marks.n>=1&&marks.stranded02===true&&marks.complete);
  await page.evaluate(()=>{ const b=game.board; for(let i=0;i<b.n;i++) game.pegAt[i]=-1; ['0,4','1,2','2,0','2,3','2,4','3,6','4,0','4,1','4,2','4,3','4,4','4,5','4,6','5,2','5,3','5,4','6,2','6,3','6,4'].forEach((k,j)=>game.pegAt[b.index[k]]=j); game.history=[{mi:0,jumped:0}]; game.evalRes=null; game.hintOn=false; render(); evaluatePosition(); });
  await page.waitForFunction(()=>!game.evaluating,{timeout:20000}); await sleep(150); s=await state();
  const m20=await page.evaluate(()=>{ const ev=game.evalRes; const i=game.board.index['2,0']; return {n:document.querySelectorAll('#board path[stroke="#e2a95c"]').length, stays20:!!((ev.optFinal.mask[0]>>>i)&1), count:ev.optFinal.count}; });
  console.log('INFO Lutz-Stellung 20:57: '+JSON.stringify(m20)+' | '+s.status);
  ok('Lutz-Stellung: (2,0) markiert, 3 Endbilder', m20.n===1&&m20.stays20&&m20.count===3&&/3 verschiedene Endbilder/.test(s.status));
  await page.evaluate(()=>{ settings.marks=false; newGame('english'); });
  // Erklaerung (frueher Strategie-Hinweise)
  await page.evaluate(()=>{ settings.computer=true; settings.marks=false; renderComputerBtn(); newGame('english'); for(let k=0;k<12;k++){ const l=currentLine(); applyMove(game.board.moves[l.path[0]],true); } render(); evaluatePosition(); });
  await page.waitForFunction(()=>!game.evaluating,{timeout:20000});
  const legal2=await page.evaluate(()=>game.board.moves.map((m,i)=>({i,ok:game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0})).filter(x=>x.ok).map(x=>x.i));
  let adv=null;
  for(const mi of legal2){ await page.evaluate(i=>{ applyMove(game.board.moves[i],true); render(); afterMove(true); },mi); await page.waitForFunction(()=>!game.evaluating,{timeout:20000}); await sleep(100); s=await state();
    if(/Strategischer Fehler/.test(s.status)){ adv=s.status; break; } await page.evaluate(()=>undo()); await sleep(1300); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000}); }
  console.log('INFO Strategie: '+adv);
  ok('Strategie-Hinweis mit Klasse, Begruendung und Aktion',
     !!adv&&/(Reihenfolge|Falsche Richtung|Stein gestrandet|Struktur)/.test(adv)
     &&/Zug zurück/.test(adv), (adv||'').slice(0,120));
  /* Der konkrete bessere Zug steht seit v1.49 NICHT mehr im Text: er ist
     faktisch ein Tipp und wurde trotzdem nicht mitgezaehlt, womit die
     Tipp-Zahl am Ende der Partie nicht ehrlich war (Lutz, 16.09.2026). Die
     Klasse und die Begruendung bleiben - das ist Analyse, kein Zug. */
  ok('Der bessere Zug wird nicht ungefragt verraten',
     !!adv&&!/Besser:/.test(adv), (adv||'').slice(0,120));
  /* Seit v1.51 steht hinter dem Pfeil rechts eine SUCHGEGEND (Lutz,
     16.09.2026: "eine Idee, wo ich nach einem richtigen Zug suchen sollte,
     kein exakter Zug als Vorgabe"). Geprueft wird deshalb nicht nur, DASS
     dort etwas steht, sondern dass es den Zug nicht verraet: kein Farbname
     und keine Richtungsangabe - beides zusammen waere der Zug. */
  const blatt=await page.evaluate(()=>{ openDetail(); const e=document.getElementById('detailSuche');
    const r=e.getBoundingClientRect();
    const farben=Object.values(HEX_NAMES);
    return {txt:e.textContent, sichtbar:!e.hidden&&r.width>0&&r.height>0,
            farbe:farben.filter(f=>e.textContent.includes(f)),
            richtung:/nach (oben|unten|links|rechts)/.test(e.textContent)}; });
  console.log('INFO Suchgegend: '+JSON.stringify(blatt));
  ok('Pfeil rechts zeigt eine Suchgegend', blatt.sichtbar&&blatt.txt.length>20, blatt.txt);
  ok('Die Suchgegend nennt keinen Farbnamen', blatt.farbe.length===0, blatt.farbe.join(','));
  ok('Die Suchgegend nennt keine Richtung', !blatt.richtung, blatt.txt);
  await page.evaluate(()=>closeDetail());
  /* Umgekehrt in v1.53. Der Knopf hiess "Zurück & Zug zeigen" und markierte
     gleich den besseren Zug - ein Tipp, den niemand angefordert hatte. Lutz
     am 16.09.2026: "Den Tipp machen wir nicht durch diesen Button, sondern
     nur durch den Tipp-Button - dann weiss man auch, wann man einen Tipp
     wirklich verbraucht." Er nimmt jetzt nur zurueck; der eigene Zug steht
     als rotes Richtungsdreieck da, und wer den besseren sehen will, holt
     ihn ueber den Tipp-Knopf. Geprueft wird deshalb, dass KEIN Pfeil
     erscheint und KEIN Tipp gezaehlt wird. */
  const tippVorStrat=await page.evaluate(()=>game.tippKeys.size);
  await page.evaluate(()=>{ [...statusEl.querySelectorAll('.link')].find(l=>/Zug zurück/.test(l.textContent)).click(); }); await sleep(1400); await page.waitForFunction(()=>!game.animating,{timeout:20000}); await sleep(200);
  const shown=await page.evaluate(()=>({hint:game.hintOn&&!!document.querySelector('#board .hint-arrow'),status:statusFullText(),moves:game.history.length,tipps:game.tippKeys.size,dreiecke:document.querySelectorAll('#board path.probiert').length}));
  console.log('INFO nach Zug zurück: '+JSON.stringify(shown));
  ok('Zug zurück nimmt den Zug zurück', shown.moves===12, JSON.stringify(shown));
  ok('Zug zurück zeigt den besseren Zug NICHT',
     !shown.hint&&!/bessere Zug ist markiert/.test(shown.status), JSON.stringify(shown));
  ok('Zug zurück kostet keinen Tipp', shown.tipps===tippVorStrat, shown.tipps+' statt '+tippVorStrat);
  /* Was stattdessen dasteht: der eigene Versuch als rotes Richtungsdreieck. */
  ok('Der zurückgenommene Zug bleibt als Dreieck stehen', shown.dreiecke>=1, String(shown.dreiecke));
  /* Und der Tipp-Knopf liefert in dieser Stellung genau den besseren Zug -
     adv.path stammt aus der Bewertung EBEN dieser Stellung, es geht also
     nichts verloren, es wird nur ehrlich gezaehlt. */
  await page.evaluate(()=>requestHint());
  await page.waitForFunction(()=>!game.searching,{timeout:30000}); await sleep(300);
  const nachTipp=await page.evaluate(()=>({hint:game.hintOn&&!!document.querySelector('#board .hint-arrow'),tipps:game.tippKeys.size}));
  console.log('INFO Tipp danach: '+JSON.stringify(nachTipp));
  ok('Der Tipp-Knopf zeigt ihn weiterhin - und zählt', nachTipp.hint&&nachTipp.tipps===tippVorStrat+1, JSON.stringify(nachTipp));
  ok('Computer-Chip sichtbar und an', await page.evaluate(()=>document.getElementById('btnComputer').classList.contains('on')));
  // Guter Zug -> grüne Rückmeldung
  await page.evaluate(()=>{ const l=currentLine(); playMove(game.board.moves[l.path[0]]); }); await sleep(400); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000}); await sleep(100);
  s=await state(); ok('Guter Zug: „In Ordnung"', /In Ordnung/.test(s.status), s.status);
  // Fehler suchen: Fehlzug, dann zwei weitere Züge, dann Link
  await page.evaluate(()=>{ newGame('english'); for(let k=0;k<12;k++){ const l=currentLine(); applyMove(game.board.moves[l.path[0]],true); } render(); });
  const legal3=await page.evaluate(()=>game.board.moves.map((m,i)=>({i,ok:game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0})).filter(x=>x.ok).map(x=>x.i));
  let culprit=-1;
  for(const mi of legal3){ const r=await page.evaluate(i=>{ const arr=occ(); const m=game.board.moves[i]; const c=arr.slice(); c[m.from]=0; c[m.over]=0; c[m.to]=1; const [lo,hi]=CORE.fromArray(c); const rr=CORE.solveSmart(game.board,lo,hi,19,{maxNodes:0,timeMs:8000,target:1}); return rr.best; },mi); if(r>1){ culprit=mi; break; } }
  ok('Fehlzug gefunden (Testaufbau)', culprit>=0);

  // Warnblitz: genau beim Uebergang "1 Stein erreichbar" -> "nicht mehr", und
  // nur dann. Erst bewerten lassen, damit prevEval steht, dann den Fehlzug
  // ueber die normale Zugbehandlung spielen.
  await page.evaluate(()=>{ game.evalRes=null; game.prevEval=null; evaluatePosition(); });
  await page.waitForFunction(()=>!game.evaluating,{timeout:60000}); await sleep(100);
  const vorBlitz=await page.evaluate(()=>game.evalRes&&game.evalRes.best);
  await page.evaluate(()=>document.getElementById('warnblitz').classList.remove('an'));
  await page.evaluate(i=>playMove(game.board.moves[i]),culprit);
  await page.waitForFunction(()=>!game.evaluating&&!game.animating,{timeout:60000}); await sleep(300);
  const blitzNachFehlzug=await page.evaluate(()=>document.getElementById('warnblitz').classList.contains('an'));
  const nachBlitz=await page.evaluate(()=>game.evalRes&&game.evalRes.best);
  console.log('INFO Warnblitz: best '+vorBlitz+' -> '+nachBlitz);
  ok('Warnblitz kommt beim Verlust der Loesung', vorBlitz===1&&nachBlitz>1&&blitzNachFehlzug, vorBlitz+' -> '+nachBlitz+', Blitz '+blitzNachFehlzug);
  await sleep(1400);
  await page.evaluate(()=>document.getElementById('warnblitz').classList.remove('an'));
  await page.evaluate(()=>{ const m=game.board.moves.find(m=>game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0); playMove(m); });
  await page.waitForFunction(()=>!game.evaluating&&!game.animating,{timeout:60000}); await sleep(300);
  ok('Kein zweiter Warnblitz in schon verlorener Stellung',
     !await page.evaluate(()=>document.getElementById('warnblitz').classList.contains('an')));
  await sleep(1400);
  const aus=await page.evaluate(()=>{ const e=document.getElementById('warnblitz'); e.classList.remove('an');
    settings.alarm=false; warnblitz(); const a=e.classList.contains('an');
    settings.alarm=true; return a; });
  ok('Abgeschalteter Warnblitz bleibt aus', !aus, aus);
  await sleep(1400);
  await page.evaluate(()=>{ document.getElementById('warnblitz').classList.remove('an'); setStatus('Dieser Stein kann nicht springen.','bad'); }); await sleep(150);
  ok('Rote Meldung ohne Bewertung loest keinen Warnblitz aus',
     !await page.evaluate(()=>document.getElementById('warnblitz').classList.contains('an')));

  /* Der Alarm darf nicht davon abhaengen, ob die Bewertung der vorigen
     Stellung schon fertig ist - Lutz spielt zuegiger, als gerechnet wird.
     Und er darf nicht gegen die Paritaetsschranke der NEUEN Stellung
     pruefen: steigt die durch den Zug selbst mit, ist best===lb und der
     Alarm blieb bis v1.34 aus, obwohl die Loesung gerade verloren ging
     (gemessen: englisches Brett, best 1 -> 2, lb 2). */
  const bau=async()=>{ await page.evaluate(()=>{ newGame('english'); cancelEval();
    for(let k=0;k<12;k++){ const l=currentLine(); applyMove(game.board.moves[l.path[0]],true); } render(); }); };
  const bestNach=(mi,n)=>page.evaluate((i,n)=>{ const arr=occ(); const m=game.board.moves[i];
    const c=arr.slice(); c[m.from]=0; c[m.over]=0; c[m.to]=1; const [lo,hi]=CORE.fromArray(c);
    return CORE.solveSmart(game.board,lo,hi,n,{maxNodes:0,timeMs:8000,target:1}).best; },mi,n);
  const legaleZuege=()=>page.evaluate(()=>game.board.moves.map((m,i)=>({i,ok:game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0})).filter(x=>x.ok).map(x=>x.i));
  /* Erst die Stellung herstellen, auf die sich legal3 bezieht - bestNach
     misst die Stellung, die gerade im Browser steht. Ohne das Aufbauen
     bewertete die Schleife ein voellig anderes Brett und hielt einen
     Fehlzug fuer den guten. */
  await bau();
  let gutZug=-1;
  for(const mi of legal3){ if(await bestNach(mi,19)===1){ gutZug=mi; break; } }
  /* Der Fehlzug muss fuer die Stellung NACH dem guten Zug gesucht werden -
     culprit ist dort nicht mehr legal. Genau daran scheiterte der erste
     Anlauf dieser Pruefung. */
  await bau(); await page.evaluate(i=>{ applyMove(game.board.moves[i],true); render(); },gutZug);
  let culprit2=-1;
  for(const mi of await legaleZuege()){ if(await bestNach(mi,18)>1){ culprit2=mi; break; } }
  ok('Guter Zug und Folge-Fehlzug gefunden (Testaufbau)', gutZug>=0&&culprit2>=0, gutZug+'/'+culprit2);
  /* warnblitz mitschreiben: sonst ist bei einem Fehlschlag nicht zu sehen,
     zu welchem Zug der Blitz gehoerte. */
  await page.evaluate(()=>{ window._alarme=[]; const orig=warnblitz;
    window._origBlitz=orig;
    window.warnblitz=function(e){ window._alarme.push({hist:game.history.length,erzwingen:!!e}); return orig.apply(this,arguments); }; });

  // Erst der gute Zug, dann ohne Warten der Fehlzug - die Bewertung des
  // guten Zuges laeuft dabei noch.
  await bau();
  await page.evaluate(()=>{ game.evalRes=null; game.prevEval=null; evaluatePosition(); });
  await page.waitForFunction(()=>!game.evaluating,{timeout:60000}); await sleep(80);
  await page.evaluate(()=>{ window._alarme=[]; document.getElementById('warnblitz').classList.remove('an'); });
  await page.evaluate(i=>playMove(game.board.moves[i]),gutZug);
  await page.waitForFunction(()=>!game.animating,{timeout:20000});
  const nochAmRechnen=await page.evaluate(()=>game.evaluating&&!game.evalRes);
  await page.evaluate(i=>playMove(game.board.moves[i]),culprit2);
  await page.waitForFunction(()=>!game.evaluating&&!game.animating,{timeout:60000});
  await page.waitForFunction(()=>!game.prevPos,{timeout:60000}); await sleep(300);
  const zuegig=await page.evaluate(()=>({blitz:document.getElementById('warnblitz').classList.contains('an'),
    alarme:window._alarme, hist:game.history.length, gemerkt:game.alarmZuege.has(game.history.length),
    lbNeu:game.evalRes&&game.evalRes.lb, best:game.evalRes&&game.evalRes.best}));
  console.log('INFO Alarm bei zuegigem Spiel: '+JSON.stringify(zuegig)+', vorige Bewertung lief noch: '+nochAmRechnen);
  ok('Warnblitz auch, wenn die vorige Bewertung noch lief',
     zuegig.blitz===true&&zuegig.gemerkt===true, JSON.stringify(zuegig));
  ok('Der Blitz gehoert zum Fehlzug, nicht zu einem frueheren',
     zuegig.alarme.length===1&&zuegig.alarme[0].hist===zuegig.hist, JSON.stringify(zuegig.alarme));
  const rettungZuegig=await page.evaluate(()=>{ const v=game.rueckAlarm; game.animating=false; undo(); game.animating=false; return {vorher:v,nachher:game.rueckAlarm}; });
  ok('Rettung zaehlt nach diesem Alarm',
     rettungZuegig.nachher===rettungZuegig.vorher+1, JSON.stringify(rettungZuegig));
  await sleep(1500);

  /* Ohne Buchlinie und ohne zwischengespeicherte Bewertung bleibt nur, die
     Vorgaengerstellung nachzurechnen. Genau dieser Fall ist der Normalfall
     mitten in einer Partie. */
  await bau();
  await page.evaluate(()=>{ game.bookLine=null; game.line=null; evalCache.clear();
    game.evalRes=null; game.prevEval=null; game.prevPos=null; window._alarme=[];
    document.getElementById('warnblitz').classList.remove('an'); });
  await page.evaluate(i=>playMove(game.board.moves[i]),culprit);
  await page.waitForFunction(()=>!game.evaluating&&!game.animating,{timeout:60000});
  await page.waitForFunction(()=>!game.prevPos,{timeout:60000}); await sleep(400);
  const nachger=await page.evaluate(()=>({blitz:document.getElementById('warnblitz').classList.contains('an'),
    alarme:window._alarme, hist:game.history.length, gemerkt:game.alarmZuege.has(game.history.length),
    prevBest:game.prevEval&&game.prevEval.best}));
  console.log('INFO Alarm nach Nachrechnen: '+JSON.stringify(nachger));
  ok('Warnblitz auch ohne jede Vorbewertung (Nachrechnen)',
     nachger.blitz===true&&nachger.gemerkt===true&&nachger.prevBest===1, JSON.stringify(nachger));
  await sleep(1500);

  /* Gegenprobe: ein guter Zug darf keinen Alarm ausloesen, auch nicht ueber
     den Nachrechen-Pfad. */
  await bau();
  await page.evaluate(()=>{ game.bookLine=null; game.line=null; evalCache.clear();
    game.evalRes=null; game.prevEval=null; game.prevPos=null; window._alarme=[];
    document.getElementById('warnblitz').classList.remove('an'); });
  await page.evaluate(i=>playMove(game.board.moves[i]),gutZug);
  await page.waitForFunction(()=>!game.evaluating&&!game.animating,{timeout:60000}); await sleep(800);
  const ohneBlitz=await page.evaluate(()=>({blitz:document.getElementById('warnblitz').classList.contains('an'),
    alarme:window._alarme, best:game.evalRes&&game.evalRes.best}));
  ok('Guter Zug loest keinen Warnblitz aus',
     ohneBlitz.blitz===false&&ohneBlitz.alarme.length===0, JSON.stringify(ohneBlitz));
  await page.evaluate(()=>{ if(window._origBlitz) window.warnblitz=window._origBlitz; });

  // Die Markierung des zurueckgenommenen Zuges soll beim Tippen aufs Brett
  // verschwinden - sie stoert sonst beim Nachdenken - und beim naechsten
  // Spulen wieder erscheinen.
  await page.evaluate(()=>{ newGame('english');
    for(let k=0;k<2;k++){ const l=currentLine()||game.bookLine; applyMove(game.board.moves[l.path[0]],true); } render(); undo(); });
  await page.waitForFunction(()=>!game.animating,{timeout:20000}); await sleep(300);
  const markZaehlen=()=>page.evaluate(()=>document.querySelectorAll('#board .back-ring').length);
  const markNachZurueck=await markZaehlen();
  await page.evaluate(()=>{ const leer=game.pegAt.findIndex(v=>v<0); onTap(leer); }); await sleep(200);
  const markNachTipp=await markZaehlen();
  await page.evaluate(()=>undo()); await page.waitForFunction(()=>!game.animating,{timeout:20000}); await sleep(300);
  const markNachSpulen=await markZaehlen();
  ok('Zurueck-Markierung erscheint beim Spulen', markNachZurueck>0, markNachZurueck);
  ok('Zurueck-Markierung verschwindet beim Tippen aufs Brett', markNachTipp===0, markNachTipp);
  // Auch neben den Feldern: ein Tipp auf die freie Brettflaeche raeumt auf.
  await page.evaluate(()=>{ const l=currentLine()||game.bookLine; if(l) applyMove(game.board.moves[l.path[0]],true); render(); undo(); });
  await page.waitForFunction(()=>!game.animating,{timeout:20000}); await sleep(300);
  const markVorFlaeche=await markZaehlen();
  const stelle=await page.evaluate(()=>{ const r=document.getElementById('board').getBoundingClientRect();
    const x=r.left+14, y=r.top+14; const e=document.elementFromPoint(x,y);
    return {x:Math.round(x),y:Math.round(y),trifftFeld:!!(e&&e.closest&&e.closest('[data-idx]'))}; });
  await page.mouse.click(stelle.x,stelle.y); await sleep(250);
  const markNachFlaeche=await markZaehlen();
  ok('Tippstelle liegt wirklich neben den Feldern', !stelle.trifftFeld, JSON.stringify(stelle));
  ok('Zurueck-Markierung verschwindet auch beim Tippen neben die Felder',
     markVorFlaeche>0&&markNachFlaeche===0, markVorFlaeche+' -> '+markNachFlaeche);
  // Die Antwort auf eine Beruehrung darf nicht sofort von der Bewertung
  // ueberschrieben werden - sonst liest man sie nie.
  await page.evaluate(()=>{ settings.computer=true; newGame('english');
    const l=currentLine()||game.bookLine; applyMove(game.board.moves[l.path[0]],true); render(); afterMove(true); });
  await sleep(120);
  const ohne=await page.evaluate(()=>{ const frei=game.board.moves.filter(m=>game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0).map(m=>m.from);
    for(let i=0;i<game.pegAt.length;i++) if(game.pegAt[i]>=0&&!frei.includes(i)&&legalMovesFrom(i).length===0){ onTap(i); return true; } return false; });
  await sleep(500);
  const gleichNach=await page.evaluate(()=>statusFullText());
  await page.waitForFunction(()=>!game.evaluating,{timeout:30000}); await sleep(400);
  ok('Hinweis auf eine Beruehrung bleibt kurz stehen',
     ohne&&/kann nicht springen/.test(gleichNach), JSON.stringify(gleichNach.slice(0,60)));
  // Zustand wiederherstellen, wie ihn die folgenden Pruefungen erwarten
  await page.evaluate(()=>{ settings.computer=true; settings.marks=false; renderComputerBtn(); });
  ok('Zurueck-Markierung kommt beim naechsten Spulen wieder', markNachSpulen>0, markNachSpulen);
  ok('Eigener Alarmton fuer den Verlust der Loesung vorhanden',
     await page.evaluate(()=>typeof Sound.alarm==='function'&&Sound.alarm!==Sound.bad));
  // Der Alarm darf nicht vom kurzen Fehlton zugedeckt werden, und er muss
  // mindestens so laut sein wie der Sprungton - sonst ueberhoert man ihn.
  const toene=await page.evaluate(()=>{ const ruf=[]; const ot=Sound.tone.bind(Sound);
    Sound.tone=(f0,f1,d,t,g,w)=>{ ruf.push({typ:t,gain:g,ab:w||0,dauer:d}); return ot(f0,f1,d,t,g,w); };
    Sound.jump(); const jump=ruf[0].gain; ruf.length=0;
    warnblitz(true); const alarm=ruf.slice(); ruf.length=0;
    Sound.win(); const sieg=ruf.slice();
    Sound.tone=ot; return {jump:jump,alarm:alarm,sieg:sieg};
  });
  console.log('INFO Toene: '+JSON.stringify(toene));
  /* Was man hoert, ist die Summe der gleichzeitig klingenden Stimmen, nicht
     die lauteste einzelne - bei einem elfstimmigen Gong sind die Einzelpegel
     klein und trotzdem ist er laut. Die fruehere Pruefung mass die Spitze
     einer Einzelstimme und wurde deshalb rot, als der Gong mehrstimmig wurde.
     Gewichtet wird mit dem Effektivwert der Wellenform. */
  const WIRKSAM=(v)=>{ const F={square:1,sine:0.7071,sawtooth:0.5774,triangle:0.5774};
    let max=0; v.forEach(a=>{ const t=a.ab!==undefined?a.ab:a[5];
      const summe=v.filter(b=>{ const bt=b.ab!==undefined?b.ab:b[5];
          const bd=b.dauer!==undefined?b.dauer:b[2];
          return bt<=t&&bt+bd>t; })
        .reduce((x,b)=>x+(b.gain!==undefined?b.gain:b[4])*(F[b.typ!==undefined?b.typ:b[3]]||0.7),0);
      if(summe>max) max=summe; });
    return max; };
  ok('Alarmton ist nicht leiser als der Sprungton',
     WIRKSAM(toene.alarm)>=toene.jump*0.7071,
     WIRKSAM(toene.alarm).toFixed(3)+' gegen '+(toene.jump*0.7071).toFixed(3));
  ok('Alarm hat mehr als zwei Toene', toene.alarm.length>2, toene.alarm.length);
  ok('Der Gong ist ab Werk eingestellt',
     await page.evaluate(()=>settings.alarmTon==='gong'),
     await page.evaluate(()=>settings.alarmTon));

  /* Jeder waehlbare Ton muss taugen: hoerbar neben dem Sprungton, erst nach
     ihm, und lang genug, dass der Fehlton ihn nicht zudeckt. 'Aus' bleibt
     still - das ist der Zweck. */
  const alle=await page.evaluate(()=>{ const merk=settings.alarmTon; const erg={};
    const ot=Sound.tone.bind(Sound);
    /* Der Zahlenwert allein sagt nichts ueber die Lautstaerke - eine
       Rechteckwelle traegt bei gleichem Wert deutlich weiter als ein Sinus.
       Gewichtet wird mit dem Effektivwert der Wellenform (Rechteck 1,
       Sinus 1/Wurzel2, Saegezahn und Dreieck 1/Wurzel3). */
    const FORM={square:1,sine:0.7071,sawtooth:0.5774,triangle:0.5774};
    Object.keys(ALARM_TOENE).forEach(k=>{ settings.alarmTon=k; const ruf=[];
      Sound.tone=(f0,f1,d,t,g,w)=>{ ruf.push({wirk:g*(FORM[t]||0.7),ab:w||0,dauer:d,ende:(w||0)+d}); };
      Sound.alarm(); const dauer=alarmDauer();
      // lauteste Stelle: Summe aller Stimmen, die dort gleichzeitig klingen
      let laut=0;
      ruf.forEach(a=>{ const su=ruf.filter(b=>b.ab<=a.ab&&b.ende>a.ab)
        .reduce((x,b)=>x+b.wirk,0); if(su>laut) laut=su; });
      erg[k]={n:ruf.length,lautest:Math.round(laut*1000)/1000,
        frueheste:ruf.length?Math.min(...ruf.map(x=>x.ab)):null,
        letztesEnde:ruf.length?Math.max(...ruf.map(x=>x.ende)):0,dauer}; });
    Sound.tone=ot; settings.alarmTon=merk; return erg; });
  console.log('INFO Alarmtoene: '+JSON.stringify(alle));
  const wahl=Object.keys(alle).filter(k=>k!=='aus');
  /* Die Schwelle, die wirklich zaehlt: Der Alarm kommt direkt nach dem
     Sprungton des Zuges und muss sich gegen ihn durchsetzen. Frueher war der
     Saegezahn-Alarm der Bezug - der liegt aber deutlich ueber dem Noetigen,
     und die Pruefung mass ausserdem die falsche Groesse (Spitze einer
     Einzelstimme statt Summe der gleichzeitigen). */
  const SCHWELLE=toene.jump*0.7071*1.2;
  ok('Jeder waehlbare Alarm setzt sich gegen den Sprungton durch',
     wahl.every(k=>alle[k].lautest>=SCHWELLE),
     JSON.stringify(wahl.map(k=>k+':'+alle[k].lautest.toFixed(3)))+' gegen '+SCHWELLE.toFixed(3));
  /* Und sie duerfen nicht zu weit auseinanderliegen - sonst ist ein Wechsel
     im Menue eine Ueberraschung statt einer Geschmacksfrage. Der Gong darf
     als einziger deutlich darueber liegen, er ist elfstimmig. */
  const ohneGong=wahl.filter(k=>k!=='gong').map(k=>alle[k].lautest);
  ok('Die uebrigen Alarme liegen dicht beieinander',
     Math.max.apply(null,ohneGong)/Math.min.apply(null,ohneGong)<=1.35,
     JSON.stringify(wahl.map(k=>k+':'+alle[k].lautest.toFixed(3))));
  ok('Jeder waehlbare Alarm setzt erst nach dem Sprungton ein',
     wahl.every(k=>alle[k].frueheste>0), JSON.stringify(wahl.map(k=>k+':'+alle[k].frueheste)));
  ok('Die Fehlton-Sperre deckt jeden Alarm ganz ab',
     wahl.every(k=>alle[k].dauer>=alle[k].letztesEnde*1000),
     JSON.stringify(wahl.map(k=>k+': '+alle[k].dauer+' ms fuer '+Math.round(alle[k].letztesEnde*1000))));
  ok('"Aus" spielt nichts und sperrt den Fehlton nicht',
     alle.aus.n===0&&alle.aus.dauer===0, JSON.stringify(alle.aus));
  ok('Der Gong klingt laenger nach als der alte Ton',
     alle.gong.letztesEnde>alle.saege.letztesEnde,
     alle.gong.letztesEnde+' gegen '+alle.saege.letztesEnde);

  /* Alle Stimmen addieren sich am Ausgang. Ab Summe 1,0 uebersteuert es
     hoerbar - das klingt nicht lauter, sondern kaputt. Geprueft wird die
     schlimmste Stelle: die Summe aller Stimmen, die gleichzeitig klingen. */
  const summen=await page.evaluate(()=>{ const merk=settings.alarmTon; const erg={};
    Object.keys(ALARM_TOENE).forEach(k=>{ const v=ALARM_TOENE[k].stimmen;
      let schlimmste=0;
      v.forEach(a=>{ const t=a[5];            // an jedem Einsatzzeitpunkt nachsehen
        const summe=v.filter(b=>b[5]<=t&&b[5]+b[2]>t).reduce((x,b)=>x+b[4],0);
        if(summe>schlimmste) schlimmste=summe; });
      erg[k]=Math.round(schlimmste*1000)/1000; });
    settings.alarmTon=merk; return erg; });
  console.log('INFO Pegelsummen: '+JSON.stringify(summen));
  ok('Kein Alarmton uebersteuert',
     Object.keys(summen).every(k=>summen[k]<1.0),
     JSON.stringify(Object.keys(summen).filter(k=>summen[k]>=1.0))+' | '+JSON.stringify(summen));

  /* Der Gong hat seit v1.26 einen eigenen Anfang: kurze Stimmen, die nach
     spaetestens 0,3 s vorbei sind, darunter zwei hohe Teiltoene, die im
     Nachklang nicht mehr vorkommen. */
  const anfang=await page.evaluate(()=>{ const v=ALARM_TOENE.gong.stimmen;
    const kurz=v.filter(a=>a[2]<=0.30), lang=v.filter(a=>a[2]>0.30);
    return {kurz:kurz.length, lang:lang.length,
      nurImAnfang:kurz.filter(a=>!lang.some(b=>b[0]===a[0])).map(a=>a[0]),
      rauschen:v.some(a=>a[0]==='rausch')}; });
  console.log('INFO Gong-Anfang: '+JSON.stringify(anfang));
  ok('Der Gong hat einen eigenen Anfang aus kurzen Stimmen',
     anfang.kurz>=4&&anfang.lang>=5, JSON.stringify(anfang));
  ok('Im Anfang klingen Teiltoene, die spaeter fehlen',
     anfang.nurImAnfang.length>=2, JSON.stringify(anfang.nurImAnfang));
  ok('Der Anfang kommt ohne Rauschen aus - kein Klacken', !anfang.rauschen);

  /* Ein gespeicherter Name, den es nicht mehr gibt, darf den Alarm nicht
     still ausfallen lassen. */
  const rueckfall=await page.evaluate(()=>{ const merk=settings.alarmTon;
    settings.alarmTon='gibtsnichtmehr';
    const a=alarmWahl(), d=alarmDauer();
    settings.alarmTon='aus'; const ausA=alarmWahl(), ausD=alarmDauer();
    settings.alarmTon=merk;
    return {name:a?a.name:null, dauer:d, ausStill:ausA.stimmen.length===0, ausDauer:ausD}; });
  console.log('INFO Rueckfall: '+JSON.stringify(rueckfall));
  ok('Unbekannter Alarmton faellt auf den Gong zurueck, statt still zu sein',
     rueckfall.name==='Klangschale'&&rueckfall.dauer>0, JSON.stringify(rueckfall));
  ok('"Aus" bleibt aus und wird nicht zurueckgesetzt',
     rueckfall.ausStill&&rueckfall.ausDauer===0, JSON.stringify(rueckfall));
  ok('Alarmton setzt erst nach dem Sprungton ein', toene.alarm[0].ab>0, toene.alarm[0].ab);
  // Fanfare: mehrstimmig (mehrere Toene mit demselben Einsatz) und laenger
  // als ein einzelner Ton, sonst klingt der Sieg wie jeder andere Piepser.
  const einsaetze={}; toene.sieg.forEach(t=>{ einsaetze[t.ab]=(einsaetze[t.ab]||0)+1; });
  const akkord=Math.max.apply(null,Object.keys(einsaetze).map(k=>einsaetze[k]));
  const ende=Math.max.apply(null,toene.sieg.map(t=>t.ab+t.dauer));
  ok('Siegfanfare ist mehrstimmig', akkord>=3, JSON.stringify(einsaetze));
  ok('Siegfanfare hat einen Schlussakkord', ende>=1.2, ende);
  ok('Siegfanfare ist lauter als der Sprungton',
     Math.max.apply(null,toene.sieg.map(t=>t.gain))>=toene.jump*0.9,
     Math.max.apply(null,toene.sieg.map(t=>t.gain))+' gegen '+toene.jump);

  // Stellung fuer die Fehlersuche neu aufbauen
  await page.evaluate(()=>{ newGame('english');
    for(let k=0;k<12;k++){ const l=currentLine(); applyMove(game.board.moves[l.path[0]],true); } render(); });
  await page.evaluate(i=>{ applyMove(game.board.moves[i],true); render(); },culprit);
  for(let k=0;k<2;k++){ await page.evaluate(()=>{ const m=game.board.moves.find(m=>game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0); applyMove(m,true); render(); }); }
  await page.evaluate(()=>{ game.evalRes=null; game.prevEval=null; evaluatePosition(); }); await page.waitForFunction(()=>!game.evaluating,{timeout:20000}); await sleep(100);
  s=await state(); console.log('INFO nach 3 Zügen: '+s.status);
  ok('Verloren, aber Zug nicht schuld: Link „Fehler suchen"', /Fehler lag früher/.test(s.status)&&/Fehler suchen/.test(s.status));
  const tippVorher=await page.evaluate(()=>game.tippKeys.size);
  await page.evaluate(()=>{ [...statusEl.querySelectorAll('.link')].find(l=>/Fehler suchen/.test(l.textContent)).click(); });
  await page.waitForFunction(()=>/entscheidende Fehler|nicht mehr erreichbar|abgebrochen/.test(statusFullText()),{timeout:60000}); await sleep(100);
  s=await state(); console.log('INFO Fehlersuche: '+s.status);
  /* Umgekehrt in v1.51: Die Fehlersuche soll die STELLE finden, nicht die
     Loesung verraten. Sie nennt Zugnummer und Fehlerklasse - und weil sie
     keinen Zug mehr ausspricht, kostet sie auch keinen Tipp mehr. Faellig
     wird der erst, wenn der Zug ueber den Knopf wirklich gezeigt wird. */
  ok('Fehlersuche nennt Zug 13 und die Fehlerklasse', /Zug war Zug 13 von 15/.test(s.status)
     &&/(Reihenfolge|Falsche Richtung|Struktur|Stein gestrandet)/.test(s.status), s.status.slice(0,120));
  ok('Fehlersuche verraet den besseren Zug nicht mehr', !/Besser war/.test(s.status), s.status.slice(0,120));
  const fsBlatt=await page.evaluate(()=>{ openDetail(); const e=document.getElementById('detailSuche');
    const t=e.textContent; closeDetail(); return {txt:t, tipps:game.tippKeys.size}; });
  console.log('INFO Fehlersuche-Blatt: '+JSON.stringify(fsBlatt));
  ok('Fehlersuche gibt eine Suchgegend statt des Zuges', fsBlatt.txt.length>20&&!/nach (oben|unten|links|rechts)/.test(fsBlatt.txt), fsBlatt.txt);
  ok('Suchen allein kostet keinen Tipp', fsBlatt.tipps===tippVorher, fsBlatt.tipps+' statt '+tippVorher);
  await page.evaluate(()=>{ [...statusEl.querySelectorAll('.link')].find(l=>/Dorthin zurück/.test(l.textContent)).click(); }); await sleep(300);
  const rw=await page.evaluate(()=>({moves:game.history.length,hint:game.hintOn&&!!document.querySelector('#board .hint-arrow'),future:game.future.length,tipps:game.tippKeys.size,status:statusFullText()}));
  console.log('INFO nach Dorthin zurück: '+JSON.stringify(rw));
  ok('Zurückgespult auf Zug 12, Vor-Verlauf erhalten', rw.moves===12&&rw.future===3, JSON.stringify(rw));
  /* Seit v1.53 zeigt auch dieser Weg den Zug nicht mehr - damit ist die
     ganze Fehlersuche kostenlos, vom Suchen bis zum Zurueckspulen. */
  ok('Dorthin zurück zeigt den Zug nicht', !rw.hint&&!/markiert/.test(rw.status), JSON.stringify(rw));
  ok('Die ganze Fehlersuche kostet keinen Tipp', rw.tipps===tippVorher, rw.tipps+' statt '+tippVorher);
  await page.evaluate(()=>{ settings.computer=false; renderComputerBtn(); newGame('english'); });
  // Längste Farbnamen passen in eine Zeile
  const fit=await page.evaluate(()=>{ const names=Object.values(HEX_NAMES).sort((a,b)=>b.length-a.length); const L=names[0];
    const st=document.getElementById('status');
    const cases=['Vor: '+L+' springt über '+L+'.','Zurück: '+L+' zurück, '+L+' wieder da.','Zurück: Stein zurück, Geschlagener wieder da.'];
    return cases.map(t=>{ setStatus(t); const k=st.querySelector('.kurz');
      return {gezeigt:k.textContent, platz:Math.round(k.clientWidth), gebraucht:Math.round(k.scrollWidth)}; }); });
  console.log('INFO Spultexte: '+JSON.stringify(fit));
  /* Lutz' Screenshot vom 17.09.2026: "Zurueck: Violett zurueck, Gold..." -
     die Kurzfassung griff die ERSTE Sinnesgrenze (den Doppelpunkt, zu kurz)
     statt der letzten vor dem Limit und fiel in die Stufe mit
     Auslassungspunkten. Spulmeldungen muessen an der Sinnesgrenze enden. */
  const spulKurz=await page.evaluate(()=>{ const names=Object.values(HEX_NAMES).sort((a,b)=>b.length-a.length); const L=names[0];
    /* Die ersten beiden ueber die allgemeine Regel; die Vor-Meldung mit zwei
       langen Farbnamen hat keine Sinnesgrenze und bekommt deshalb im Code eine
       ausdrueckliche Kurzfassung - hier wird sie ueber das echte Spulen geholt. */
    newGame('english'); const l=currentLine(); applyMove(game.board.moves[l.path[0]],true); render();
    undo(); const vorKurz=(game.lastMove||{}).kurz||''; finishAnimation();
    const proben=['Zurück: Violett zurück, Gold wieder da.','Zurück: '+L+' zurück, '+L+' wieder da.'];
    return proben.map(t=>kurzfassung(t)).concat(['Vor: '+L+' über '+L, vorKurz.replace(/^Zurück/,'Zurück')]); });
  console.log('INFO Spul-Kurzfassungen: '+JSON.stringify(spulKurz));
  ok('Zurueck-Meldung wird an der Sinnesgrenze gekuerzt', spulKurz[0]==='Zurück: Violett zurück', spulKurz[0]);
  ok('Keine Spul-Kurzfassung endet mit Auslassungspunkten', spulKurz.every(k=>!/\u2026$/.test(k)), spulKurz.join(' | '));
  ok('Vor-Kurzfassung passt mit den laengsten Farbnamen in 32 Zeichen', spulKurz[2].length<=32, spulKurz[2]+' ('+spulKurz[2].length+')');
  ok('Das echte Spulen liefert eine Kurzfassung ohne Punkte', /^Zurück: \S+ zurück$/.test(spulKurz[3]), spulKurz[3]);
  ok('Keine Kurzfassung endet auf Komma oder Strich vor den Punkten', spulKurz.every(k=>!/[,;:\u2013]\s*\u2026$/.test(k)), spulKurz.join(' | '));
  /* Und das Blatt hinter dem Pfeil zeigt den Satz EINMAL: Titel ist das
     Stichwort, nicht der abgeschnittene Anfang desselben Satzes. */
  const blattSpul=await page.evaluate(()=>{ setStatus('Zurück: Violett zurück, Gold wieder da.','',null,null,'Zug 3 von 3'); openDetail();
    const r={titel:document.getElementById('detailTitel').textContent, text:document.getElementById('detailText').textContent}; closeDetail(); return r; });
  console.log('INFO Blatt Spulmeldung: '+JSON.stringify(blattSpul));
  ok('Blatt: Titel ist das Stichwort, nicht der gekuerzte Satz', blattSpul.titel==='Zurück', blattSpul.titel);
  ok('Blatt: der Satz steht einmal ganz', blattSpul.text==='Zurück: Violett zurück, Gold wieder da.', blattSpul.text);
  /* Gegenprobe: eine eigenstaendige Kurzfassung bleibt Titel. */
  const blattEigen=await page.evaluate(()=>{ setStatus('In Ordnung – 1 Stein ist weiterhin erreichbar.','ok',null,null,null,'1 Stein bleibt erreichbar'); openDetail();
    const t=document.getElementById('detailTitel').textContent; closeDetail(); return t; });
  ok('Blatt: eigenstaendige Kurzfassung bleibt Titel', blattEigen==='1 Stein bleibt erreichbar', blattEigen);
  ok('Spultexte passen mit längsten Farbnamen in die Meldungszeile', fit.every(x=>x.gebraucht<=x.platz+1), JSON.stringify(fit.map(x=>x.gebraucht+'/'+x.platz)));
  // Themes screenshots
  for(const th of ['holz','edel','messing','filz','neon','marmor']){ await page.evaluate(t=>{ settings.theme=t; newGame('english'); },th); await sleep(150); await page.screenshot({path:`shot_theme_${th}.png`}); }
  // Settings sheet
  await page.evaluate(()=>{ settings.theme='eigene'; }); await page.click('#btnMenu'); await sleep(500); await page.screenshot({path:'shot_sheet.png'});
  ok('Einstellungen geöffnet', await page.$eval('#sheet',e=>e.classList.contains('on')));
  const chips=await page.evaluate(()=>{ const l=document.getElementById('alarmList');
    return {n:l.children.length,namen:[...l.children].map(c=>c.textContent),
      gewaehlt:[...l.children].filter(c=>c.classList.contains('on')).map(c=>c.textContent)}; });
  console.log('INFO Alarmwahl im Menue: '+JSON.stringify(chips));
  ok('Alle Alarmtoene stehen im Menue zur Wahl',
     chips.n===6&&chips.namen.includes('Klangschale')&&chips.namen.includes('Aus'), JSON.stringify(chips.namen));
  ok('Genau der eingestellte Ton ist markiert',
     chips.gewaehlt.length===1&&chips.gewaehlt[0]==='Klangschale', JSON.stringify(chips.gewaehlt));
  ok('Tippen auf einen anderen Ton stellt ihn ein', await page.evaluate(()=>{
       const l=document.getElementById('alarmList');
       const ziel=[...l.children].find(c=>c.textContent==='Absturz'); ziel.click();
       const jetzt=settings.alarmTon; settings.alarmTon='gong'; saveSettings(); buildSheet();
       return jetzt==='absturz'; }));
  ok('Menue nennt dieselbe Version wie das Startbild',
     await page.evaluate(()=>document.getElementById('versionLine').textContent==='Solitaire v'+APP_VERSION),
     await page.$eval('#versionLine',e=>e.textContent));
  // free start
  await page.evaluate(()=>{ settings.freeStart=true; closeSheet(); newGame('english'); }); await sleep(300);
  s=await state(); ok('Freies Startloch: Brett voll (33)', s.left===33, JSON.stringify(s));
  await tap(await idx(3,3)); s=await state(); ok('Startloch gesetzt: 32 Steine', s.left===32&&s.moves===0, s.status);
  await page.evaluate(()=>{ settings.freeStart=false; newGame('english'); });
  // dead-end detection: construct position with no moves
  await page.evaluate(()=>{ newGame('english'); const b=game.board; for(let i=0;i<b.n;i++) game.pegAt[i]=-1; game.pegAt[b.index['0,2']]=0; game.pegAt[b.index['1,3']]=1; game.pegAt[b.index['3,3']]=2; game.pegAt[b.index['3,4']]=3; render(); });
  // (3,3)->(3,5) over (3,4) is legal; play it and then no more moves -> 3 pegs left, game over
  await page.evaluate(()=>{ game.history=[]; game.future=[]; game.finished=false; hideModal('resultModal'); }); await tap(await idx(3,3)); await sleep(700); s=await state();
  ok('Endstellung erkannt: keine Züge, 3 Steine', s.finished&&s.left===3, JSON.stringify(s));

  /* Lutz' Stellung vom 13.09.2026 (Screenshot, 23 Steine, 8 Endbilder):
     gruen springt von (4,6) ueber (4,5) nach (4,4) und verliert damit die
     Loesung. Der bessere Zug fuellt dasselbe Loch von oben - (2,4) ueber
     (3,4) nach (4,4). Bis v1.21 landete das bei der Klasse "Struktur" und
     war nicht zu verstehen. Die Stellung ist unabhaengig nachgerechnet:
     vorher 1 Stein erreichbar, nachher bestenfalls 2. */
  const stellung=()=>{ newGame('english'); const b=game.board;
    const bild=['  ppp  ','  ..p  ','ppppppp','pppzpzp','pppzzpp','  zpz  ','  zzp  '];
    for(let i=0;i<b.n;i++) game.pegAt[i]=-1; let id=0;
    for(let r=0;r<7;r++) for(let c=0;c<7;c++){ const i=b.index[r+','+c];
      if(i!==undefined&&bild[r][c]==='p') game.pegAt[i]=id++; }
    game.phase='play'; game.history=[]; game.future=[]; game.finished=false;
    game.evalRes=null; game.prevEval=null; game.startCount=23; render(); };
  /* Seit v1.54 gibt es nur noch einen Pfad (Hauptschalter Computer); der
     Parameter bleibt, damit die zweite Runde den Wortlaut auf Stabilitaet
     prueft - zweimal dieselbe Stellung muss zweimal dasselbe sagen. */
  const lutzZug=async(strategie)=>{
    await page.evaluate(()=>{ settings.computer=true; settings.marks=false; renderComputerBtn(); });
    await page.evaluate(stellung); await sleep(200);
    await page.evaluate(()=>evaluatePosition());
    await page.waitForFunction(()=>game.evalRes&&!game.evaluating,{timeout:20000});
    const vorher=await page.evaluate(()=>game.evalRes.best);
    await page.evaluate(()=>{ const b=game.board;
      const m=b.moves.find(x=>x.from===b.index['4,6']&&x.over===b.index['4,5']&&x.to===b.index['4,4']);
      applyMove(m,true); render(); evaluatePosition(); });
    await page.waitForFunction(()=>game.evalRes&&!game.evaluating&&game.evalRes.key===stateKey(),{timeout:20000});
    await sleep(300);
    return {vorher, nachher:await page.evaluate(()=>game.evalRes.best),
      endbilder:await page.evaluate(()=>game.evalRes.optFinal?game.evalRes.optFinal.count:0),
      text:await page.evaluate(()=>statusFullText()),
      kurz:await page.$eval('#status .kurz',e=>e.textContent)}; };

  const mitStrat=await lutzZug(true);
  console.log('INFO Lutz-Zug mit Strategie: '+JSON.stringify(mitStrat));
  ok('Lutz-Stellung stimmt: vorher 1 Stein, nachher 2, 8 Endbilder',
     mitStrat.vorher===1&&mitStrat.nachher===2&&mitStrat.endbilder===8, JSON.stringify(mitStrat).slice(0,120));
  ok('Falsch gefuelltes Loch heisst "Falsche Richtung", nicht "Struktur"',
     /Falsche Richtung/.test(mitStrat.text)&&!/Struktur/.test(mitStrat.text), mitStrat.text.slice(0,110));
  /* Umgekehrt in v1.51: Bis v1.50 nannte die Erklaerung beide Richtungen
     ("musste nach oben gehen, nicht nach rechts") - zusammen mit dem Loch ist
     das der Zug. Lutz am 16.09.2026: "kein exakter Zug als Vorgabe". Die
     Erklaerung sagt jetzt nur noch, DASS die Seite falsch war; wo zu suchen
     ist, steht als Gegend im Blatt hinter dem Pfeil. */
  ok('Erklaerung nennt die Richtung nicht mehr',
     /von einer anderen Seite/.test(mitStrat.text)&&!/nach (oben|unten|links|rechts)/.test(mitStrat.text),
     mitStrat.text.slice(0,140));

  const ohneStrat=await lutzZug(false);
  console.log('INFO Lutz-Zug zweite Runde: '+JSON.stringify(ohneStrat));
  ok('Zweite Runde nennt dieselbe Fehlerklasse',
     /Falsche Richtung/.test(ohneStrat.text), ohneStrat.text.slice(0,140));
  ok('Auch die zweite Runde verraet den Zug nicht ungefragt',
     !/Besser:/.test(ohneStrat.text), ohneStrat.text.slice(0,160));
  ok('Kurzfassung bleibt bei hoechstens 32 Zeichen', ohneStrat.kurz.length<=32, ohneStrat.kurz);
  await page.evaluate(()=>{ settings.computer=true; renderComputerBtn(); newGame('english'); });

  /* Der Audio-Kontext schlaeft auf iOS ein (Anruf, App im Hintergrund). Toene
     duerfen dann nicht verloren gehen, sondern muessen beim Aufwachen kommen. */
  const schlaf=await page.evaluate(()=>{ Sound.ensure(); if(!Sound.ctx) return {ohneKontext:true};
    Sound.wartend=[]; const echt=Sound.ctx;
    Sound.ctx={state:'suspended',resume(){ return Promise.resolve(); }};
    Sound.jump(); const gepuffert=Sound.wartend.length;
    Sound.ctx=echt; const geplant=[]; const ot=Sound.tone.bind(Sound);
    Sound.tone=(...a)=>{ geplant.push(a[0]); };
    Sound.nachholen(); Sound.tone=ot;
    return {gepuffert,nachgeholt:geplant.length}; });
  console.log('INFO Schlafender Ton: '+JSON.stringify(schlaf));
  ok('Ton im Schlaf geht nicht verloren, sondern wartet', schlaf.gepuffert===1, JSON.stringify(schlaf));
  ok('Wartender Ton wird beim Aufwachen nachgeholt', schlaf.nachgeholt===1, JSON.stringify(schlaf));
  ok('Beruehrung weckt den Ton', await page.evaluate(()=>{ let ruf=0; const oe=Sound.ensure.bind(Sound);
       Sound.ensure=()=>{ ruf++; return oe(); };
       document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
       Sound.ensure=oe; return ruf>0; }));

  /* Das Zeichen am gestrandeten Stein erklaert sich sonst nirgends. Geprueft
     an Lutz' Stellung vom 13.09.2026, 13:57 Uhr (14 Steine, bestenfalls 2,
     zwei Endbilder): unabhaengig nachgerechnet bleibt genau (4,6) in beiden
     Endbildern besetzt - genau der Stein mit dem Zeichen im Screenshot. */
  const marke=await page.evaluate(async()=>{
    settings.marks=true; settings.computer=true; renderComputerBtn();
    Store.del('markeErklaert');
    newGame('english'); const B=game.board;
    const bild=['  zpp  ','  zpz  ','zzzzppp','zzzzzpp','zzpzzzp','  zpp  ','  zpp  '];
    for(let i=0;i<B.n;i++) game.pegAt[i]=-1; let id=0;
    for(let r=0;r<7;r++) for(let c=0;c<7;c++){ const i=B.index[r+','+c];
      if(i!==undefined&&bild[r][c]==='p') game.pegAt[i]=id++; }
    game.phase='play'; game.history=[]; game.future=[]; game.finished=false;
    game.evalRes=null; game.prevEval=null; game.lastMove=null; hinweisBis=0;
    document.getElementById('toast').classList.remove('on');
    render(); evaluatePosition();
    return {steine:pegCount()}; });
  await page.waitForFunction(()=>game.evalRes&&!game.evaluating&&game.evalRes.key===stateKey(),{timeout:30000});
  await sleep(200);
  const m1=await page.evaluate(()=>{ const B=game.board;
    const treffer=[]; for(let i=0;i<B.n;i++) if(istGestrandet(i)) treffer.push(B.cells[i].r+','+B.cells[i].c);
    return {steine:pegCount(),best:game.evalRes.best,endbilder:game.evalRes.optFinal?game.evalRes.optFinal.count:0,
      treffer, ersteMeldung:document.getElementById('toast').textContent,
      schwebt:document.getElementById('toast').classList.contains('on'),
      statuszeile:statusFullText(), gemerkt:Store.get('markeErklaert',false)}; });
  console.log('INFO Markierung: '+JSON.stringify(m1));
  ok('Markierung trifft genau das nachgerechnete Feld (4,6)',
     m1.steine===14&&m1.best===2&&m1.endbilder===2&&m1.treffer.length===1&&m1.treffer[0]==='4,6',
     JSON.stringify(m1.treffer)+' bei '+m1.steine+' Steinen, bestenfalls '+m1.best);
  ok('Beim ersten Auftauchen wird das Zeichen von selbst erklaert',
     m1.schwebt&&/hier bleibt ein Stein stehen/.test(m1.ersteMeldung)&&m1.gemerkt===true,
     m1.ersteMeldung.slice(0,90));
  /* Die Erklaerung darf die gerade fertige Bewertung nicht verdraengen -
     deshalb schwebt sie, statt die Statuszeile zu belegen. */
  ok('Die Erklaerung verdraengt die Bewertung nicht',
     !/hier bleibt ein Stein stehen/.test(m1.statuszeile), m1.statuszeile.slice(0,70));

  const m2=await page.evaluate(async()=>{
    /* Zweites Auftauchen: kein Hinweis mehr von selbst. */
    document.getElementById('toast').classList.remove('on');
    document.getElementById('toast').textContent='';
    hinweisBis=0; setStatus('Nichts Besonderes.'); renderOverlay();
    const vorher=document.getElementById('toast').textContent;
    const i=game.board.index['4,6'];
    hinweisBis=0; onTap(i); const nachTipp=statusFullText();
    return {ohneZweiteMeldung:vorher,nachTipp,
      kurz:document.querySelector('#status .kurz').textContent}; });
  console.log('INFO Markierung, Tipp: '+JSON.stringify(m2));
  ok('Kein zweites Mal von selbst', m2.ohneZweiteMeldung==='',
     JSON.stringify(m2.ohneZweiteMeldung));
  ok('Tippen auf den markierten Stein erklaert das Zeichen erneut',
     /bestmöglichen Fortsetzung besetzt/.test(m2.nachTipp), m2.nachTipp.slice(0,90));
  ok('Kurzfassung der Erklaerung bleibt bei hoechstens 32 Zeichen',
     m2.kurz.length<=32, m2.kurz+' ('+m2.kurz.length+')');
  const gegen=await page.evaluate(()=>{ hinweisBis=0; game.selected=-1;
    /* Ein Stein ohne Zuege und ohne Markierung: sonst loest der Tipp einen
       Auto-Sprung aus und die Statuszeile ist noch die alte. */
    let i=-1; for(let c=0;c<game.board.n;c++)
      if(game.pegAt[c]>=0&&!istGestrandet(c)&&!legalMovesFrom(c).length){ i=c; break; }
    if(i<0) return {gefunden:false};
    onTap(i);
    return {gefunden:true,feld:game.board.cells[i].r+','+game.board.cells[i].c,
      text:statusFullText()}; });
  console.log('INFO Gegenprobe: '+JSON.stringify(gegen));
  ok('Ein nicht markierter Stein bekommt die Erklaerung nicht',
     gegen.gefunden&&!/bestmöglichen Fortsetzung besetzt/.test(gegen.text)
     &&/kann nicht springen/.test(gegen.text), JSON.stringify(gegen));
  ok('Ohne die Einstellung gibt es keine Markierung',
     await page.evaluate(()=>{ settings.marks=false;
       const r=istGestrandet(game.board.index['4,6']); settings.marks=true; return !r; }));
  await page.evaluate(()=>{ settings.marks=false; settings.computer=true; renderComputerBtn();
    Store.del('markeErklaert'); newGame('english'); });

  abschnitt='Zaehler';
  /* Zwei Zaehler fuer die Partie: Ruecknahmen nach einem Verlustzug und
     verbrauchte Tipps. Gezaehlt wird nicht jedes Zurueck, sondern nur das
     Zuruecknehmen genau des Zuges, der die Loesung gekostet hat. */
  const zaehler=await page.evaluate(async()=>{
    newGame('english'); settings.computer=true; settings.alarm=true;
    const B=game.board, erg={};
    erg.startRueck=game.rueckAlarm; erg.startTipp=game.tippKeys.size;

    // Ein Zug, der die Loesung kostet - der Alarm merkt sich die Zuglaenge
    const l=currentLine(); applyMove(B.moves[l.path[0]],true); render();
    warnblitz();                       // wie aus finish(), also ohne erzwingen
    erg.gemerkt=game.alarmZuege.has(game.history.length);
    // Ein anderer Zug oben drauf: ein Zurueck von dort zaehlt nicht
    const l2=currentLine(); if(l2&&l2.path.length) applyMove(B.moves[l2.path[0]],true);
    game.animating=false; undo(); game.animating=false;
    erg.nachFremdemZurueck=game.rueckAlarm;
    // Jetzt der Alarm-Zug selbst
    undo(); game.animating=false;
    erg.nachAlarmZurueck=game.rueckAlarm;
    // Nochmal vor und zurueck: derselbe Zug zaehlt kein zweites Mal
    redo(); game.animating=false; undo(); game.animating=false;
    erg.nachWiederholung=game.rueckAlarm;

    // Tipps: derselbe Tipp zweimal ist einer, eine neue Stellung ist zwei
    newGame('english');
    requestHint(); erg.tipp1=game.tippKeys.size;
    requestHint(); erg.tipp2=game.tippKeys.size;
    const l3=currentLine()||{path:[0]}; applyMove(B.moves[l3.path[0]],true); render();
    requestHint(); erg.tipp3=game.tippKeys.size;

    // Anzeige in der Zaehlerzeile
    game.rueckAlarm=2; game.tippKeys=new Set(['a','b','c']); renderHud();
    erg.zeigtRueck=document.getElementById('hudRett').textContent;
    erg.zeigtTipp=document.getElementById('hudTipp').textContent;
    erg.hervor=document.getElementById('hudRett').classList.contains('da');
    game.rueckAlarm=0; game.tippKeys=new Set(); renderHud();
    erg.leerRueck=document.getElementById('hudRett').textContent;
    erg.leerTipp=document.getElementById('hudTipp').textContent;
    erg.leerHervor=document.getElementById('hudRett').classList.contains('da');
    const dts=[...document.querySelectorAll('.hud .neben dt')].map(e=>e.textContent);
    erg.labelTipp=dts[0]; erg.labelRett=dts[1];
    /* Wort und Zahl muessen in derselben Zeile stehen - das ist der Kern
       des 2x2-Rasters. */
    const paar=(dt,dd)=>Math.abs(dt.getBoundingClientRect().top-dd.getBoundingClientRect().top)<6;
    const alleDt=[...document.querySelectorAll('.hud .neben dt')];
    const alleDd=[...document.querySelectorAll('.hud .neben dd')];
    erg.nebeneinander=paar(alleDt[0],alleDd[0])&&paar(alleDt[1],alleDd[1]);
    erg.untereinander=alleDt[1].getBoundingClientRect().top>alleDt[0].getBoundingClientRect().top+4;
    /* Ergebnis einer Partie ohne Huerden: eine Stellung ohne legale Zuege
       bauen und afterMove() den Schluss machen lassen - den Ergebnistext
       erzeugt nur dieser Weg. */
    newGame('english');
    for(let i=0;i<B.n;i++) game.pegAt[i]=-1;
    ['0,2','4,0','6,4'].forEach((k,j)=>game.pegAt[B.index[k]]=j);
    game.finished=false; game.startedAt=Date.now()-61000; game.elapsedBefore=0;
    game.history=[{mi:0,jumped:0}]; game.rueckAlarm=0; game.tippKeys=new Set();
    afterMove(true);
    erg.ergebnisSauber=document.getElementById('resText').textContent;
    erg.sauberRett=document.getElementById('resRett').textContent;
    erg.sauberTipp=document.getElementById('resTipp').textContent;
    erg.sauberHervor=document.getElementById('resRett').classList.contains('da');
    hideModal('resultModal'); newGame('english');
    return erg; });
  console.log('INFO Zaehler: '+JSON.stringify(zaehler));
  ok('Die Zaehler starten bei null',
     zaehler.startRueck===0&&zaehler.startTipp===0, JSON.stringify(zaehler));
  ok('Der Alarm merkt sich den verlorenen Zug', zaehler.gemerkt===true);
  ok('Ein Zurueck auf einem anderen Zug zaehlt nicht',
     zaehler.nachFremdemZurueck===0, zaehler.nachFremdemZurueck);
  ok('Das Zuruecknehmen des verlorenen Zuges zaehlt',
     zaehler.nachAlarmZurueck===1, zaehler.nachAlarmZurueck);
  ok('Derselbe Zug zaehlt kein zweites Mal',
     zaehler.nachWiederholung===1, zaehler.nachWiederholung);
  ok('Derselbe Tipp zweimal angesehen ist ein Tipp',
     zaehler.tipp1===1&&zaehler.tipp2===1, zaehler.tipp1+' / '+zaehler.tipp2);
  ok('Ein Tipp in einer neuen Stellung zaehlt dazu',
     zaehler.tipp3===2, zaehler.tipp3);
  /* In der Zaehlerzeile stehen nur die Zahlen unter ihrer Beschriftung,
     im Ergebnis ganze Worte mit richtiger Einzahl und Mehrzahl. */
  ok('Die Zaehlerzeile zeigt die Zahlen',
     zaehler.zeigtRueck==='2'&&zaehler.zeigtTipp==='3',
     JSON.stringify([zaehler.zeigtRueck,zaehler.zeigtTipp]));
  ok('Die Beschriftungen heissen Tipps und Rettung',
     zaehler.labelTipp==='Tipps'&&zaehler.labelRett==='Rettung',
     JSON.stringify([zaehler.labelTipp,zaehler.labelRett]));
  ok('Wort und Zahl stehen nebeneinander', zaehler.nebeneinander===true);
  ok('Die beiden Zeilen stehen untereinander', zaehler.untereinander===true);
  ok('Eine Zahl groesser null wird hervorgehoben',
     zaehler.hervor===true&&zaehler.leerHervor===false,
     JSON.stringify([zaehler.hervor,zaehler.leerHervor]));
  /* Im Ergebnis stehen die Zahlen NEBEN der Steinzahl, nicht mehr im Satz -
     sie sind Leistungsmerkmale der Partie und gingen im Fliesstext unter
     (Lutz, 14.09.2026). Der Satz darf sie deshalb nicht mehr wiederholen. */
  ok('Das Ergebnis wiederholt die Zaehler nicht im Text',
     !/Rettung|Tipp/.test(zaehler.ergebnisSauber), zaehler.ergebnisSauber);
  /* Hier zeigt eine Null bewusst eine Null: am Ende einer Partie ist
     "0 Rettungen" die Leistung, ueber die man sich freut - live waere sie
     nur "noch nichts passiert" und steht dort als Strich. */
  ok('Ohne Huerden stehen im Ergebnis Nullen, kein Strich',
     zaehler.sauberRett==='0'&&zaehler.sauberTipp==='0'&&zaehler.sauberHervor===false,
     JSON.stringify([zaehler.sauberRett,zaehler.sauberTipp,zaehler.sauberHervor]));
  /* Bei null ein Strich statt einer Null: eine Null liest sich wie ein
     Mangel, ein Strich wie "noch nichts passiert". */
  ok('Bei null steht ein Strich, keine Null',
     zaehler.leerRueck==='–'&&zaehler.leerTipp==='–',
     JSON.stringify([zaehler.leerRueck,zaehler.leerTipp]));

  /* Die untere Zeile ist hart einzeilig; was nicht passt, kuerzt
     kurzfassung(). Bis v1.30 schnitt sie nur am Wortende ab und liess den
     Leser im Nebensatz haengen: aus "Tippe einen Stein an - bei mehreren
     Zielen wische in die Richtung." wurde "Tippe einen Stein an - bei..."
     (Lutz' Screenshot vom 13.09.2026, 21:03 Uhr). */
  const kurzProben=await page.evaluate(()=>{
    const proben=[
      'Tippe einen Stein an – bei mehreren Zielen wische in die Richtung.',
      'Tippe einen Stein an, dann das Zielfeld oder wische in die Richtung.',
      'Tippe den Stein an, der zu Beginn herausgenommen wird.',
      '3 Züge möglich – wische in die Richtung oder tippe das Zielfeld.',
      'Tippe das Zielfeld oder wische dorthin.',
      'Keine Züge mehr – 3 Steine übrig.',
      'Gelöst – 1 Stein übrig.',
      'Startloch gesetzt. Viel Erfolg.',
      'Das war nicht das Muster – die Endstellung stimmt nicht.',
      'Hintergrund-Rechner antwortet nicht – weiche aus.',
      'Zurück auf Zug 12. Von hier aus ging es noch auf 1 Stein.',
      'Kein Zug gefunden, der die Lösung gekostet hat – die Stellung war nicht lösbar.',
      'Diese Stellung war in sechs Sekunden nicht zu Ende zu rechnen.',
      'Bis Zug 14 zurück geprüft: dort war 1 Stein schon nicht mehr erreichbar.',
      'Abschnitt 2 von 5 geschafft.'];
    return proben.map(v=>({voll:v,kurz:kurzfassung(v)})); });
  console.log('INFO Kurzfassungen: '+JSON.stringify(kurzProben.map(x=>x.kurz)));
  /* Ein echter Bruch ist nur eine Kuerzung mit Auslassungspunkten, die auf
     einem Bindewort endet - "Tippe einen Stein an" ist ein ganzer Satz und
     darf so stehen bleiben. */
  const BINDE=/\s(und|oder|aber|denn|sondern|als|wie|mit|von|für|bei|nach|über|unter|durch|dann|noch|auch|nur|schon)…$/i;
  ok('Keine Kurzfassung ist laenger als 32 Zeichen',
     kurzProben.every(x=>x.kurz.length<=32),
     JSON.stringify(kurzProben.filter(x=>x.kurz.length>32).map(x=>x.kurz)));
  ok('Keine Kurzfassung endet mitten im Nebensatz',
     kurzProben.every(x=>!BINDE.test(x.kurz)),
     JSON.stringify(kurzProben.filter(x=>BINDE.test(x.kurz)).map(x=>x.kurz)));
  ok('Kurze Meldungen bleiben unveraendert',
     kurzfassungGleich(kurzProben,'Gelöst – 1 Stein übrig.','Gelöst – 1 Stein übrig'),
     JSON.stringify(kurzProben.find(x=>/Gelöst/.test(x.voll))));
  ok('An einer Sinnesgrenze wird ohne Auslassungspunkte getrennt',
     kurzProben.filter(x=>/[–,;:]/.test(x.voll)&&x.voll.length>34)
       .some(x=>!/…$/.test(x.kurz)&&x.kurz.length>=10),
     JSON.stringify(kurzProben.map(x=>x.kurz).filter(k=>!/…$/.test(k))));

  /* Und dieselbe Probe im Gerät: der sichtbare Text darf nicht abgeschnitten
     werden - sonst nuetzt die beste Kurzfassung nichts. */
  const imGeraet=await page.evaluate(async()=>{
    const erg=[]; hinweisBis=0;
    for(const t of ['Tippe einen Stein an – bei mehreren Zielen wische in die Richtung.',
                    '3 Züge möglich – wische in die Richtung oder tippe das Zielfeld.',
                    'Keine Züge mehr – 3 Steine übrig.']){
      setStatus(t);
      const k=document.querySelector('#status .kurz');
      erg.push({text:k.textContent, platz:Math.round(k.clientWidth),
        gebraucht:Math.round(k.scrollWidth)});
    }
    return erg; });
  console.log('INFO Kurzfassung im Geraet: '+JSON.stringify(imGeraet));
  ok('Die Kurzfassung passt in die Zeile, ohne abgeschnitten zu werden',
     imGeraet.every(x=>x.gebraucht<=x.platz+1),
     JSON.stringify(imGeraet.map(x=>x.gebraucht+'/'+x.platz)));

  /* Hinweis auf eine neuere Version. Der Vergleich muss stellenweise als Zahl
     laufen: als Text waere '1.9' groesser als '1.22', und genau dort steht die
     Zaehlung gerade. */
  const vgl=await page.evaluate(()=>[
    ['1.23','1.22',true],['1.22','1.22',false],['1.21','1.22',false],
    ['1.22','1.9',true],['1.9','1.22',false],
    ['1.3','1.2.1',true],['1.2.1','1.3',false],['1.2.1','1.2',true],
    ['2.0','1.99',true],['x','1.22',false]
  ].map(([a,b,soll])=>({a,b,soll,ist:versionNeuer(a,b)})));
  console.log('INFO Versionsvergleich: '+JSON.stringify(vgl.map(x=>x.a+'>'+x.b+'='+x.ist)));
  ok('Versionsvergleich rechnet stellenweise, nicht alphabetisch',
     vgl.every(x=>x.ist===x.soll), JSON.stringify(vgl.filter(x=>x.ist!==x.soll)));

  /* Geladen wird nur der Anfang der Datei - APP_VERSION muss also im Fenster
     liegen, und zwar mit Luft. Rutscht sie hinaus, findet die Pruefung nichts
     mehr und meldet still nie ein Update. */
  const lage=await page.evaluate(()=>{
    const roh=document.documentElement.outerHTML; const i=roh.indexOf("APP_VERSION='");
    return {pos:i,fenster:UPDATE_FENSTER}; });
  const quelle=require('fs').readFileSync(require('path').join(__dirname,'..','index.html'));
  const bytePos=quelle.indexOf(Buffer.from("const APP_VERSION='"));
  console.log('INFO APP_VERSION bei Byte '+bytePos+' von '+quelle.length+', Fenster '+lage.fenster);
  ok('APP_VERSION liegt im geladenen Fenster, mit Luft',
     bytePos>0&&bytePos<lage.fenster*0.8, bytePos+' von '+lage.fenster);

  const upd=await page.evaluate(()=>{ zeigeUpdate('9.9');
    const e=document.getElementById('update');
    const r=e.getBoundingClientRect();
    return {sichtbar:e.classList.contains('on'),text:e.querySelector('.txt').textContent,
      schwebt:getComputedStyle(e).position,breite:Math.round(r.width),
      zuGross:Math.round(e.querySelector('.zu').getBoundingClientRect().width)}; });
  console.log('INFO Update-Hinweis: '+JSON.stringify(upd));
  ok('Update-Hinweis erscheint und nennt die Nummer',
     upd.sichtbar&&/9\.9/.test(upd.text), upd.text);
  ok('Update-Hinweis schwebt, kostet also keine Brettflaeche', upd.schwebt==='fixed', upd.schwebt);
  ok('Schliessknopf ist gross genug zum Treffen', upd.zuGross>=30, upd.zuGross+' px');
  ok('Update-Hinweis laesst sich wegtippen', await page.evaluate(()=>{
       const e=document.getElementById('update'); e.querySelector('.zu').click();
       return !e.classList.contains('on'); }));

  /* Der ganze Weg: Anfrage stellen, Nummer aus der Antwort lesen, Hinweis
     zeigen - oder eben nicht. Die Antwort wird gefaelscht, weil hier kein
     Server steht. */
  const weg=await page.evaluate(async()=>{
    const e=document.getElementById('update'); const echt=window.fetch;
    const lauf=async antwort=>{ e.classList.remove('on'); updateGeprueft=0;
      let anfrage=null;
      window.fetch=(u,o)=>{ anfrage={u:String(u),o}; return Promise.resolve({ok:true,text:async()=>antwort}); };
      await pruefeUpdate();
      return {gezeigt:e.classList.contains('on'),text:e.querySelector('.txt').textContent,anfrage}; };
    const neuer=await lauf("x\nconst APP_VERSION='9.9';\ny");
    const gleich=await lauf("const APP_VERSION='"+APP_VERSION+"';");
    const aelter=await lauf("const APP_VERSION='0.1';");
    const muell=await lauf('<html>nichts davon</html>');
    e.classList.remove('on'); updateGeprueft=0;
    let kaputt=false;
    window.fetch=()=>Promise.reject(new Error('offline'));
    try{ await pruefeUpdate(); }catch(x){ kaputt=true; }
    const offline={gezeigt:e.classList.contains('on'),kaputt};
    window.fetch=echt; e.classList.remove('on');
    return {neuer,gleich,aelter,muell,offline}; });
  console.log('INFO Update-Weg: '+JSON.stringify(weg));
  ok('Neuere Version auf dem Server wird gemeldet',
     weg.neuer.gezeigt&&/9\.9/.test(weg.neuer.text), JSON.stringify(weg.neuer.text));
  ok('Gleiche Version meldet nichts', !weg.gleich.gezeigt);
  ok('Aeltere Version meldet nichts', !weg.aelter.gezeigt);
  ok('Unlesbare Antwort meldet nichts', !weg.muell.gezeigt);
  ok('Offline meldet nichts und wirft nicht', !weg.offline.gezeigt&&!weg.offline.kaputt,
     JSON.stringify(weg.offline));
  ok('Es wird nur der Anfang der Datei geholt',
     /bytes=0-/.test((weg.neuer.anfrage.o.headers||{}).Range||''),
     JSON.stringify(weg.neuer.anfrage.o.headers));
  ok('Die Anfrage umgeht den Zwischenspeicher',
     weg.neuer.anfrage.o.cache==='no-store', weg.neuer.anfrage.o.cache);
  ok('Zweite Pruefung kurz danach laedt nicht noch einmal',
     await page.evaluate(async()=>{ let n=0; const echt=window.fetch;
       window.fetch=()=>{ n++; return Promise.resolve({ok:true,text:async()=>''}); };
       updateGeprueft=Date.now(); await pruefeUpdate(); await pruefeUpdate();
       window.fetch=echt; return n===0; }));

  /* Die Kopfzeile von CLAUDE.md stand zwei Auslieferungen lang auf einer alten
     Version, weil das Nachziehen still fehlschlug. Nichts, was man ansieht -
     also pruefen. */
  const claude=require('fs').readFileSync(require('path').join(__dirname,'..','CLAUDE.md'),'utf8');
  const stand=(claude.match(/^Stand: v([0-9.]+) /m)||[])[1];
  const appV=await page.evaluate(()=>APP_VERSION);
  ok('CLAUDE.md nennt dieselbe Version wie APP_VERSION', stand===appV, stand+' gegen '+appV);
  ok('CLAUDE.md fuehrt diese Version in der Aenderungsliste',
     new RegExp('\\*\\*v'+appV.replace(/\./g,'\\.')+'\\*\\*').test(claude), 'v'+appV);

  abschnitt='Ergebnis-Block';
  /* Die Zaehler stehen im Ergebnis neben der grossen Steinzahl, auf einer
     Hoehe mit ihr und rechts davon - nicht im Fliesstext. */
  const ergBlock=await page.evaluate(()=>{ const B=game.board; newGame('english');
    for(let i=0;i<B.n;i++) game.pegAt[i]=-1; game.pegAt[B.centerIdx]=0;
    game.finished=false; game.startedAt=Date.now()-296000; game.elapsedBefore=0;
    game.history=new Array(31).fill({mi:0,jumped:0});
    game.rueckAlarm=8; game.tippKeys=new Set(['a']);
    afterMove(true); showModal('resultModal');
    const big=document.getElementById('resBig').getBoundingClientRect();
    const nb=document.querySelector('.ergneben').getBoundingClientRect();
    const rt=document.getElementById('resRett'), tp=document.getElementById('resTipp');
    const karte=document.querySelector('#resultModal .card').getBoundingClientRect();
    const dts=[...document.querySelectorAll('.ergneben dt')].map(e=>e.textContent);
    return {rett:rt.textContent, tipp:tp.textContent, hervor:rt.classList.contains('da'),
      rechts:nb.left>=big.right, aufHoehe:Math.abs((big.top+big.height/2)-(nb.top+nb.height/2))<20,
      /* Gross genug, um aufzufallen: mindestens halb so hoch wie die
         Steinzahl, sonst sind sie wieder nur Kleingedrucktes. */
      zahlHoch:parseFloat(getComputedStyle(rt).fontSize),
      bigHoch:parseFloat(getComputedStyle(document.getElementById('resBig')).fontSize),
      worte:dts, karteImBild:karte.top>=0&&karte.bottom<=window.innerHeight,
      text:document.getElementById('resText').textContent}; });
  await page.evaluate(()=>{ hideModal('resultModal'); newGame('english'); });
  console.log('INFO Ergebnis-Block: '+JSON.stringify(ergBlock));
  ok('Die Zaehler stehen rechts neben der Steinzahl',
     ergBlock.rechts===true&&ergBlock.aufHoehe===true, JSON.stringify(ergBlock));
  ok('Die Zaehler zeigen die richtigen Zahlen, hervorgehoben',
     ergBlock.rett==='8'&&ergBlock.tipp==='1'&&ergBlock.hervor===true,
     JSON.stringify([ergBlock.rett,ergBlock.tipp,ergBlock.hervor]));
  ok('Sie sind gross genug, um aufzufallen',
     ergBlock.zahlHoch>=ergBlock.bigHoch*0.5, ergBlock.zahlHoch+' gegen '+ergBlock.bigHoch);
  ok('Im Ergebnis stehen ganze Worte in der Mehrzahl',
     ergBlock.worte[0]==='Rettungen'&&ergBlock.worte[1]==='Tipps', JSON.stringify(ergBlock.worte));
  ok('Die Ergebniskarte bleibt im Bild', ergBlock.karteImBild===true);

  abschnitt='Pause';
  /* Pause von Hand. Sie muss die Uhr wirklich anhalten und das Brett dabei
     verdecken - eine Pause mit sichtbarem Brett waere ein Zeitstopp zum
     Nachdenken, und dann ist jede Bestleistung wertlos. */
  await page.evaluate(()=>{ newGame('english');
    const l=currentLine(); applyMove(game.board.moves[l.path[0]],true); render(); renderHud();
    game.startedAt=Date.now()-30000; game.elapsedBefore=0; renderHud(); });
  const vorPause=await page.evaluate(()=>({zeit:document.getElementById('hudTime').textContent,
    treffer:(r=>({b:r.width,h:r.height}))(document.getElementById('hudZeit').getBoundingClientRect())}));
  await page.evaluate(()=>document.getElementById('hudZeit').click());
  await sleep(1600);
  const inPause=await page.evaluate(()=>{ const st=document.getElementById('stage').getBoundingClientRect();
    const pa=document.getElementById('pause').getBoundingClientRect();
    const bg=getComputedStyle(document.getElementById('pause')).backgroundColor;
    return {an:game.pauseAn, zeit:document.getElementById('hudTime').textContent,
      label:document.getElementById('hudZeitLabel').textContent.trim(),
      deckt:pa.width>=st.width-1&&pa.height>=st.height-1,
      /* Deckend heisst: keine Transparenz. Ein durchscheinendes Brett
         waere genau die Bedenkzeit, die die Pause verhindern soll. */
      deckend:!/rgba\(.*,\s*0?\.\d+\)/.test(bg)&&bg!=='transparent',
      undoAus:document.getElementById('btnUndo').disabled,
      hintAus:document.getElementById('btnHint').disabled}; });
  console.log('INFO Pause: '+JSON.stringify(vorPause)+' -> '+JSON.stringify(inPause));
  ok('Die Zeit-Zelle ist gross genug zum Treffen (44 pt)',
     vorPause.treffer.b>=44&&vorPause.treffer.h>=44,
     Math.round(vorPause.treffer.b)+'x'+Math.round(vorPause.treffer.h));
  ok('Die Pause haelt die Uhr an',
     inPause.an===true&&inPause.zeit===vorPause.zeit,
     vorPause.zeit+' -> '+inPause.zeit);
  ok('Die Pause verdeckt das Brett deckend',
     inPause.deckt===true&&inPause.deckend===true, JSON.stringify(inPause));
  ok('In der Pause ist die Fussleiste gesperrt',
     inPause.undoAus===true&&inPause.hintAus===true, JSON.stringify([inPause.undoAus,inPause.hintAus]));
  ok('Die Zeit-Zelle sagt, dass sie angehalten ist',
     inPause.label==='Angehalten', inPause.label);
  /* Der sichtbare Weg in die Pause ist der Chip neben den
     Strategie-Hinweisen. Vorher hing sie allein an einem Zeichen von
     7 x 9 px neben dem Wort "Zeit" - Lutz fand es nicht. */
  const chip=await page.evaluate(()=>{ const c=document.getElementById('btnPause');
    const r=c.getBoundingClientRect(), st=document.getElementById('btnComputer').getBoundingClientRect();
    return {text:c.textContent.trim(), hervor:c.classList.contains('on'), aus:c.disabled,
      flaeche:Math.round(r.width*r.height), b:Math.round(r.width), h:Math.round(r.height),
      sichtbar:getComputedStyle(c).display!=='none'&&r.width>0,
      nebenStrategie:r.left>=st.right-1, gleicheHoehe:Math.abs(r.height-st.height)<2}; });
  console.log('INFO Pause-Chip: '+JSON.stringify(chip));
  ok('Der Pause-Chip steht sichtbar neben dem Computer-Chip',
     chip.sichtbar===true&&chip.nebenStrategie===true&&chip.gleicheHoehe===true, JSON.stringify(chip));
  /* Gross genug, um gefunden zu werden - das war der ganze Punkt. Zum
     Vergleich: das alte Zeichen hatte 63 px². */
  ok('Er ist um ein Vielfaches groesser als das alte Zeichen',
     chip.flaeche>=2000, chip.flaeche+' px² gegen 63 px²');
  ok('Waehrend der Pause heisst er Weiter und ist hervorgehoben',
     chip.text==='Weiter'&&chip.hervor===true, JSON.stringify([chip.text,chip.hervor]));
  /* Kommt Lutz aus dem Hintergrund zurueck, darf die Uhr nicht von allein
     wieder loslaufen - er hat sie von Hand angehalten. */
  const ausHintergrund=await page.evaluate(async()=>{
    /* document.hidden ist nur lesbar - fuer den echten Ablauf (weg und
       zurueck) muss es umdefiniert werden. Ein blosses Event ohne hidden
       durchlaeuft den Handler gar nicht und pruefte nichts. */
    let versteckt=false;
    const alt=Object.getOwnPropertyDescriptor(Document.prototype,'hidden');
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>versteckt});
    versteckt=true; document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r=>setTimeout(r,60));
    const weg={an:game.pauseAn,paused:game.paused,startedAt:game.startedAt};
    versteckt=false; document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r=>setTimeout(r,60));
    const zurueck={an:game.pauseAn,paused:game.paused,startedAt:game.startedAt,
      zeit:document.getElementById('hudTime').textContent};
    delete document.hidden; if(alt) Object.defineProperty(Document.prototype,'hidden',alt);
    return {weg,zurueck}; });
  console.log('INFO Hintergrund: '+JSON.stringify(ausHintergrund));
  ok('Eine Handpause ueberlebt die Rueckkehr aus dem Hintergrund',
     ausHintergrund.zurueck.an===true&&!ausHintergrund.zurueck.startedAt,
     JSON.stringify(ausHintergrund.zurueck));
  const nachWeiter=await (async()=>{ const v=await page.evaluate(()=>document.getElementById('hudTime').textContent);
    await page.evaluate(()=>document.getElementById('btnWeiter').click());
    await sleep(1600);
    return {vor:v, nach:await page.evaluate(()=>({an:game.pauseAn, zeit:document.getElementById('hudTime').textContent,
      sichtbar:document.getElementById('pause').classList.contains('an'),
      undoAus:document.getElementById('btnUndo').disabled}))}; })();
  console.log('INFO Weiter: '+JSON.stringify(nachWeiter));
  const chipNach=await page.evaluate(()=>{ const c=document.getElementById('btnPause');
    return {text:c.textContent.trim(), hervor:c.classList.contains('on')}; });
  ok('Danach heisst der Chip wieder Pause',
     chipNach.text==='Pause'&&chipNach.hervor===false, JSON.stringify(chipNach));
  ok('Weiter laesst die Uhr wieder laufen und gibt das Brett frei',
     nachWeiter.nach.an===false&&nachWeiter.nach.sichtbar===false
     &&nachWeiter.nach.undoAus===false&&nachWeiter.nach.zeit!==nachWeiter.vor,
     JSON.stringify(nachWeiter));
  /* Die Zeit darf durch die Pause nicht verloren gehen und nicht dazukommen:
     30 s vor der Pause, rund 1,6 s Pause, danach wieder rund 30 s. */
  const zeitTreu=await page.evaluate(()=>elapsedMs());
  ok('Die Pause verschiebt die gemessene Zeit nicht',
     zeitTreu>=29500&&zeitTreu<=33000, zeitTreu+' ms');
  /* Vor dem ersten Zug laeuft keine Uhr - dann fuehrt der Chip ins Leere
     und ist matt. */
  const chipFrisch=await page.evaluate(()=>{ newGame('english');
    return {aus:document.getElementById('btnPause').disabled, gestartet:!!game.startedAt}; });
  ok('Ohne laufende Uhr ist der Chip matt',
     chipFrisch.aus===true&&chipFrisch.gestartet===false, JSON.stringify(chipFrisch));
  await page.evaluate(()=>newGame('english'));

  /* Ein neues Spiel muss eine laufende Animation verwerfen, nicht abarbeiten:
     ihr Abschluss gehoert zum alten Spiel und spielte seinen Zug sonst auf
     dem frischen Brett nach. Gefunden hat das die Pause - sie raeumt
     Animationen ab und stuerzte dabei in redo() ab (game.lastMove war schon
     null). Der Fehler steckte unabhaengig davon im Code. */
  abschnitt='Abbruch';
  const abbruch=await page.evaluate(async()=>{
    newGame('english');
    const l=currentLine(); applyMove(game.board.moves[l.path[0]],true); render();
    undo();                                   // startet eine Spul-Animation
    const lief=game.animating;
    newGame('english');                       // mitten hinein
    const nachNeu={animating:game.animating, zuege:game.history.length, steine:pegCount()};
    /* Jetzt darf finishAnimation() nichts mehr nachholen. */
    finishAnimation();
    await new Promise(r=>setTimeout(r,900));
    return {lief, nachNeu, danach:{zuege:game.history.length, steine:pegCount()}}; });
  console.log('INFO Abbruch: '+JSON.stringify(abbruch));
  ok('Ein neues Spiel verwirft eine laufende Animation (Testaufbau)', abbruch.lief===true);
  ok('Das frische Brett bleibt unberuehrt',
     abbruch.nachNeu.zuege===0&&abbruch.nachNeu.steine===32
     &&abbruch.danach.zuege===0&&abbruch.danach.steine===32, JSON.stringify(abbruch));

  /* Der Glanz beim Beruehren und beim Sprung (v1.39, umgebaut v1.40).

     Die erste Fassung dieser Pruefungen fragte, ob opacity gesetzt WIRD - das
     wurde es, und trotzdem sah Lutz auf dem iPhone nichts. Sie stellte die
     falsche Frage, genau wie die Trefferflaechen-Messung bei v1.38. Mit
     "Bewegung reduzieren" blieb der Streifen 96 Einheiten neben einer Murmel
     mit Radius 34 stehen und wurde weggeschnitten: opacity gesetzt, null zu
     sehen. Deshalb wird hier jetzt GEZAEHLT, was sich auf dem Bild aendert -
     und zwar in beiden Bewegungs-Einstellungen. */
  abschnitt='Glanz';
  const glanz=await page.evaluate(async()=>{
    settings.funkeln=true; newGame('english'); settings.autoJump=false;
    const erst=game.pegAt.findIndex(v=>v>=0);
    const g=pegsLayer.querySelector('[data-idx="'+erst+'"] .glanz');
    const kugel=pegsLayer.querySelector('[data-idx="'+erst+'"] circle:not(.glanz)');
    const erg={vorhanden:!!g, ruheFill:g&&g.getAttribute('fill'),
      ruheOpacity:g&&g.getAttribute('fill-opacity'),
      anzahl:pegsLayer.querySelectorAll('.glanz').length, steine:pegCount()};
    /* Der Glanz ist ein Kreis in Murmelgroesse - er deckt sie, statt von
       aussen durch einen Ausschnitt hereingeschoben zu werden. Damit gibt es
       keine Stellung, in der er daneben liegt. */
    const rg=g.getBoundingClientRect(), rk=kugel.getBoundingClientRect();
    const ueber=Math.max(0,Math.min(rg.right,rk.right)-Math.max(rg.left,rk.left))
               *Math.max(0,Math.min(rg.bottom,rk.bottom)-Math.max(rg.top,rk.top));
    erg.deckung=rk.width*rk.height>0?ueber/(rk.width*rk.height):0;
    glanzAn(erst);
    await new Promise(r=>setTimeout(r,60));
    erg.frueh=(g.getAttribute('fill')||'').match(/url\(#(.*)\)/);
    erg.fruehStops=erg.frueh?[...document.getElementById(erg.frueh[1]).children].map(e=>e.getAttribute('offset')).join(','):'';
    erg.frueh=!!erg.frueh;
    await new Promise(r=>setTimeout(r,240));
    erg.mitteOpacity=parseFloat(g.getAttribute('fill-opacity'));
    const m2=(g.getAttribute('fill')||'').match(/url\(#(.*)\)/);
    erg.mitteStops=m2?[...document.getElementById(m2[1]).children].map(e=>e.getAttribute('offset')).join(','):'';
    erg.verlaeufeLaufend=document.querySelectorAll('defs linearGradient[id^="mglz"]').length;
    await new Promise(r=>setTimeout(r,900));
    erg.endeOpacity=parseFloat(g.getAttribute('fill-opacity'));
    erg.endeFill=g.getAttribute('fill');
    /* Der eigene Verlauf wird nach dem Lauf wieder abgeraeumt, sonst waechst
       defs mit jedem Funkeln. */
    erg.verlaeufeDanach=document.querySelectorAll('defs linearGradient[id^="mglz"]').length;
    settings.funkeln=false; glanzAn(erst);
    await new Promise(r=>setTimeout(r,120));
    erg.ausOpacity=parseFloat(g.getAttribute('fill-opacity'));
    settings.funkeln=true;
    newGame('english'); settings.autoJump=false;
    const echt=window.glanzAn, log=[];
    window.glanzAn=function(i){ log.push(i); return echt.apply(this,arguments); };
    const m=game.board.moves.find(m=>game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0);
    onTap(m.from); erg.beiTipp=log.slice(); erg.getippt=m.from;
    log.length=0; game.selected=-1; settings.autoJump=true; playMove(m);
    await new Promise(r=>setTimeout(r,700));
    erg.beiZug=log.slice(); erg.ziel=m.to;
    window.glanzAn=echt;
    return erg; });
  console.log('INFO Glanz: '+JSON.stringify(glanz));
  ok('Jede Murmel traegt einen Glanz-Knoten',
     glanz.vorhanden===true&&glanz.anzahl===glanz.steine,
     glanz.anzahl+' Knoten bei '+glanz.steine+' Steinen');
  ok('In Ruhe ist er unsichtbar',
     glanz.ruheOpacity==='0'&&glanz.ruheFill==='none',
     glanz.ruheOpacity+' / '+glanz.ruheFill);
  ok('Der Glanz deckt die Murmel, statt daneben zu liegen',
     glanz.deckung>0.95, 'Deckung '+(glanz.deckung*100).toFixed(1)+' %');
  ok('Mitten im Lauf ist er sichtbar', glanz.mitteOpacity>0.3, String(glanz.mitteOpacity));
  ok('Der Streifen wandert (die Stops verschieben sich)',
     glanz.frueh===true&&glanz.fruehStops!==''&&glanz.fruehStops!==glanz.mitteStops,
     glanz.fruehStops+'  ->  '+glanz.mitteStops);
  ok('Danach ist er wieder unsichtbar',
     glanz.endeOpacity===0&&glanz.endeFill==='none',
     glanz.endeOpacity+' / '+glanz.endeFill);
  ok('Der eigene Verlauf wird abgeraeumt',
     glanz.verlaeufeLaufend===1&&glanz.verlaeufeDanach===0,
     glanz.verlaeufeLaufend+' waehrend, '+glanz.verlaeufeDanach+' danach');
  ok('Abgeschaltet bleibt er aus', glanz.ausOpacity===0, String(glanz.ausOpacity));
  ok('Ein beruehrter Stein funkelt',
     glanz.beiTipp.length===1&&glanz.beiTipp[0]===glanz.getippt,
     JSON.stringify(glanz.beiTipp)+' gegen Stein '+glanz.getippt);
  ok('Nach einem Sprung funkelt der gelandete Stein',
     glanz.beiZug.length===1&&glanz.beiZug[0]===glanz.ziel,
     JSON.stringify(glanz.beiZug)+' gegen Zielfeld '+glanz.ziel);

  /* Die Regel von Lutz (14.09.2026): "Nur beim Landen fuer Steine die
     springen. Auch beim Tippen fuer Steine die sich nicht bewegen - entweder
     weil es keine Sprungsteine sind oder weil mehr als eine Option besteht."

     Also: Der Glanz gehoert dem Stein, der LIEGEN BLEIBT. Wer sofort
     wegspringt, glaenzt an seinem Ziel, nicht an seinem Ausgangspunkt. Vier
     Faelle, alle einzeln geprueft - v1.39 traf nur einen davon, v1.41 traf
     alle vier und damit einen zu viel. */
  abschnitt='Glanz-Ausloeser';
  const ausl=await page.evaluate(async()=>{
    const erg={};
    const mit=()=>{ const e=window.glanzAn, l=[];
      window.glanzAn=function(i){ l.push(i); return e.apply(this,arguments); };
      return {l,zurueck:()=>{window.glanzAn=e;}}; };
    const frisch=auto=>{ settings.funkeln=true; settings.autoJump=auto; newGame('english'); };
    const suche=n=>game.pegAt.findIndex((v,k)=>v>=0&&legalMovesFrom(k).length===n);
    /* (1) Kein moeglicher Zug - bleibt liegen, also Glanz. */
    frisch(true); let g=mit();
    erg.ohneStein=suche(0); onTap(erg.ohneStein); erg.ohneZug=g.l.slice(); g.zurueck();
    /* (2) Genau ein Zug bei Auto-Sprung - springt weg, also KEIN Glanz am
           Ausgangspunkt, nur am Ziel. */
    frisch(true); g=mit();
    erg.von=suche(1); erg.nach=legalMovesFrom(erg.von)[0].to;
    onTap(erg.von); erg.sofort=g.l.slice();
    await new Promise(r=>setTimeout(r,700));
    erg.nachSprung=g.l.slice(); g.zurueck();
    /* (3) Mehrere Ziele - bleibt liegen und wird ausgewaehlt, also Glanz. */
    frisch(true); g=mit();
    erg.mehrStein=game.pegAt.findIndex((v,k)=>v>=0&&legalMovesFrom(k).length>1);
    /* In der Eroeffnung hat kein Stein zwei Ziele - das Brett ist zu voll.
       Also ein paar Zuege spielen, bis einer auftaucht. */
    for(let z=0;z<10&&erg.mehrStein<0;z++){
      const m=game.board.moves.find(m=>game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0);
      if(!m) break; applyMove(m,true); render();
      erg.mehrStein=game.pegAt.findIndex((v,k)=>v>=0&&legalMovesFrom(k).length>1); }
    erg.mehrZiele=erg.mehrStein>=0?legalMovesFrom(erg.mehrStein).length:0;
    if(erg.mehrStein>=0) onTap(erg.mehrStein);
    erg.mehr=g.l.slice(); g.zurueck();
    /* (4) Genau ein Zug, Auto-Sprung AUS - bleibt liegen, also Glanz. */
    frisch(false); g=mit();
    erg.einsStein=suche(1); onTap(erg.einsStein); erg.eins=g.l.slice(); g.zurueck();
    /* Wie lange steht er wirklich da? "sehr kurz" war Lutz' zweiter Punkt -
       die Spitze von sin() ist nur einen Augenblick lang oben. */
    frisch(true);
    const i=game.pegAt.findIndex(v=>v>=0);
    const c=pegsLayer.querySelector('[data-idx="'+i+'"] .glanz');
    const t0=performance.now(), proben=[]; glanzAn(i);
    await new Promise(fertig=>{ (function tick(){
      proben.push([performance.now()-t0,parseFloat(c.getAttribute('fill-opacity'))||0]);
      if(performance.now()-t0<1400) requestAnimationFrame(tick); else fertig(); })(); });
    const voll=proben.filter(x=>x[1]>=0.8);
    erg.vollMs=voll.length?Math.round(voll[voll.length-1][0]-voll[0][0]):0;
    erg.hoechste=Math.max(...proben.map(x=>x[1]));
    return erg; });
  console.log('INFO Glanz-Ausloeser: '+JSON.stringify(ausl));
  ok('Ein Stein ohne moeglichen Zug funkelt beim Antippen',
     ausl.ohneZug.length===1&&ausl.ohneZug[0]===ausl.ohneStein,
     JSON.stringify(ausl.ohneZug)+' gegen Stein '+ausl.ohneStein);
  ok('Ein Stein mit mehreren Zielen funkelt beim Antippen',
     ausl.mehrStein>=0&&ausl.mehrZiele>1&&ausl.mehr.length===1&&ausl.mehr[0]===ausl.mehrStein,
     JSON.stringify(ausl.mehr)+' gegen Stein '+ausl.mehrStein+' ('+ausl.mehrZiele+' Ziele)');
  ok('Ohne Auto-Sprung funkelt auch ein Stein mit genau einem Zug',
     ausl.eins.length===1&&ausl.eins[0]===ausl.einsStein,
     JSON.stringify(ausl.eins)+' gegen Stein '+ausl.einsStein);
  /* Der Kern der Regel: wer wegspringt, glaenzt NICHT am Ausgangspunkt. */
  ok('Bei Auto-Sprung funkelt der beruehrte Stein NICHT',
     ausl.sofort.length===0, JSON.stringify(ausl.sofort)+' (erwartet: keiner)');
  ok('Bei Auto-Sprung funkelt nur der gelandete Stein',
     ausl.nachSprung.length===1&&ausl.nachSprung[0]===ausl.nach,
     JSON.stringify(ausl.nachSprung)+' gegen Zielfeld '+ausl.nach);
  /* Vorher stand er nur rund 180 ms bei voller Kraft - das war "sehr kurz". */
  ok('Der Glanz steht lange genug voll da',
     ausl.vollMs>=500, ausl.vollMs+' ms bei voller Kraft');
  ok('Er wird kraeftig genug', ausl.hoechste>=0.9, String(ausl.hoechste));

  /* Und jetzt die Frage, die zaehlt: sieht man etwas? Gezaehlt werden die
     Bildpunkte, die sich gegenueber dem Standbild aendern - an einem Stein,
     der NICHT angetippt ist, denn die Auswahl-Markierung ist selbst animiert
     und legt sonst einen Sockel von rund 1500 Punkten unter das Ergebnis. */
  async function glanzBildpunkte(){
    const info=await page.evaluate(()=>{
      settings.funkeln=true; newGame('english');
      const i=game.pegAt.findIndex(v=>v>=0);
      const r=pegsLayer.querySelector('[data-idx="'+i+'"]').getBoundingClientRect();
      return {i,box:{x:Math.round(r.x)-6,y:Math.round(r.y)-6,
                     width:Math.round(r.width)+12,height:Math.round(r.height)+12}};
    });
    await sleep(120);
    const grund=PNG.sync.read(await page.screenshot({clip:info.box}));
    await page.evaluate(i=>glanzAn(i),info.i);
    let max=0, zuletzt=0;
    for(let k=0;k<9;k++){
      await sleep(60);
      const jetzt=PNG.sync.read(await page.screenshot({clip:info.box}));
      let n=0; for(let j=0;j<jetzt.data.length;j+=4)
        if(Math.abs(jetzt.data[j]-grund.data[j])>6) n++;
      if(n>max) max=n; zuletzt=n;
    }
    return {max,zuletzt};
  }
  const pxNormal=await glanzBildpunkte();
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  const pxReduce=await glanzBildpunkte();
  await page.emulateMediaFeatures([]);
  console.log('INFO Glanz sichtbar: normal='+JSON.stringify(pxNormal)+' reduziert='+JSON.stringify(pxReduce));
  ok('Man sieht den Glanz wirklich', pxNormal.max>150, pxNormal.max+' geaenderte Bildpunkte');
  ok('Er endet spurlos', pxNormal.zuletzt===0, pxNormal.zuletzt+' Punkte bleiben');
  /* Die Pruefung, die v1.39 gefehlt hat: iOS hat "Bewegung reduzieren" oft
     an, und dort war der Effekt vollstaendig tot - gemessene null. */
  ok('Auch mit reduzierter Bewegung sieht man ihn',
     pxReduce.max>150, pxReduce.max+' geaenderte Bildpunkte');
  ok('Auch reduziert endet er spurlos', pxReduce.zuletzt===0, pxReduce.zuletzt+' Punkte bleiben');

  /* Wie hell die Ampel leuchtet (v1.43). Langer Druck auf die Ampel oeffnet
     einen Regler mit fuenf Stufen. Gemessen wird wieder, was zu SEHEN ist -
     dass eine Variable sich aendert, sagt nichts darueber. */
  abschnitt='Ampelkraft';
  const ak=await page.evaluate(async()=>{
    const erg={};
    const druck=async(ms,versatz)=>{
      ampelBlattZu(); await new Promise(r=>setTimeout(r,340));
      const d=statusEl.querySelector('.dot'), r=d.getBoundingClientRect();
      const x=r.x+r.width/2, y=r.y+r.height/2, id=Math.floor(Math.random()*1e6);
      d.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:x,clientY:y,pointerId:id}));
      if(versatz) statusEl.dispatchEvent(new PointerEvent('pointermove',
        {bubbles:true,clientX:x+versatz,clientY:y,pointerId:id}));
      await new Promise(r2=>setTimeout(r2,ms));
      const auf=$('ampelBlatt').classList.contains('on');
      d.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:x,clientY:y,pointerId:id}));
      return auf;
    };
    erg.lang=await druck(700,0);
    erg.kurz=await druck(200,0);
    /* Ein Wisch ueber das Brett darf den Regler nicht aufziehen. */
    erg.gewischt=await druck(700,40);
    ampelBlattZu();
    erg.stufen=AMPEL_MAX;
    erg.reglerMax=$('ampelRegler').max;
    const w0=ampelWerte(0);
    erg.standard=w0.schein===8&&w0.dicht===0&&w0.hof===0&&w0.bild===0;
    /* Der Schein im Bild ist kein Schalter mehr, sondern waechst mit
       (Wunsch von Lutz, 15.09.2026: "auch ein bisschen weniger als jetzt,
       trotzdem der grosse Schein"). */
    erg.bild=[]; for(let n=0;n<=AMPEL_MAX;n++) erg.bild.push(+ampelWerte(n).bild.toFixed(3));
    erg.namen=[ampelName(0),ampelName(2),ampelName(AMPEL_HOF_AB),ampelName(AMPEL_MAX)];
    /* Probe und echte Ampel muessen denselben Schein tragen. */
    setStatus('1 Stein bleibt erreichbar','ok'); ampelKraftSetzen(7,false);
    $('ampelBlatt').classList.add('on');
    erg.echt=getComputedStyle(statusEl.querySelector('.dot b.gr')).boxShadow;
    erg.probe=getComputedStyle(document.querySelectorAll('.aprobe')[2].querySelector('b.gr')).boxShadow;
    $('ampelBlatt').classList.remove('on');
    /* Der Regler zeigt, wo er steht. */
    ampelKraftSetzen(6,false); erg.name=$('ampelStufe').textContent; erg.regler=$('ampelRegler').value;
    /* Gespeichert wird die Wahl. */
    ampelKraftSetzen(7,true); erg.gemerkt=(Store.get('settings',{})||{}).ampelKraft;
    /* Bei Rot tritt der Hof hinter den Warnblitz zurueck - zwei rote Blitze
       uebereinander waeren Matsch, keine Verstaerkung. */
    ampelKraftSetzen(AMPEL_MAX,false);
    $('ampelhof').classList.remove('an'); warnblitzZeit=Date.now();
    blitzAusstehend=Date.now(); setStatus('Bestenfalls 2 Steine','bad');
    await new Promise(r=>setTimeout(r,120));
    erg.hofBeiRotMitBlitz=$('ampelhof').classList.contains('an');
    $('ampelhof').classList.remove('an'); warnblitzZeit=0;
    blitzAusstehend=Date.now(); setStatus('1 Stein bleibt erreichbar','ok');
    await new Promise(r=>setTimeout(r,120));
    erg.hofBeiGruen=$('ampelhof').classList.contains('an');
    /* Eine gewoehnliche Meldung ohne Ergebnis darf den Raum nicht fluten. */
    $('ampelhof').classList.remove('an'); blitzAusstehend=0;
    setStatus('Dieser Stein kann nicht springen.','bad');
    await new Promise(r=>setTimeout(r,120));
    erg.hofOhneErgebnis=$('ampelhof').classList.contains('an');
    ampelKraftSetzen(0,true);
    return erg; });
  console.log('INFO Ampelkraft: '+JSON.stringify(ak));
  ok('Langer Druck auf die Ampel oeffnet den Regler', ak.lang===true, String(ak.lang));
  ok('Ein kurzer Druck oeffnet ihn nicht', ak.kurz===false, String(ak.kurz));
  ok('Ein Wisch bricht den langen Druck ab', ak.gewischt===false, String(ak.gewischt));
  ok('Elf Reglerpositionen', ak.stufen===10&&ak.reglerMax==='10',
     ak.stufen+' / Regler bis '+ak.reglerMax);
  ok('Die unterste Stufe ist genau der alte Zustand', ak.standard===true,
     'Schein 8, dicht 0, Hof 0, kein Schein im Bild');
  /* Der Schein im Bild ist abgestuft, nicht an/aus: unten nichts, dann acht
     wachsende Staerken bis zur vollen. */
  ok('Der Schein im Bild bleibt unten aus',
     ak.bild.slice(0,3).every(v=>v===0), JSON.stringify(ak.bild.slice(0,3)));
  ok('Er setzt schon bei seiner ersten Stufe sichtbar ein',
     ak.bild[3]>0.1&&ak.bild[3]<0.2, String(ak.bild[3]));
  ok('Und waechst von dort Schritt fuer Schritt auf voll',
     ak.bild.slice(3).every((v,i,a)=>i===0||v>a[i-1])&&ak.bild[10]===1,
     JSON.stringify(ak.bild.slice(3)));
  ok('Der Name nennt den Schein im Bild, sobald es ihn gibt',
     ak.namen[0]==='Wie bisher'&&!/Schein/.test(ak.namen[1])
     &&/Schein im Bild/.test(ak.namen[2])&&/Schein im Bild/.test(ak.namen[3]),
     JSON.stringify(ak.namen));
  ok('Probe und echte Ampel tragen denselben Schein', ak.echt===ak.probe,
     ak.echt+'  gegen  '+ak.probe);
  ok('Der Regler zeigt, wo er steht',
     ak.name==='Stufe 6 von 10 · Schein im Bild'&&ak.regler==='6', ak.name+' / '+ak.regler);
  ok('Die Wahl wird gemerkt', ak.gemerkt===7, String(ak.gemerkt));
  ok('Bei Rot tritt der Schein hinter den Warnblitz zurueck',
     ak.hofBeiRotMitBlitz===false, String(ak.hofBeiRotMitBlitz));
  ok('Bei Gruen kommt der Schein im Bild', ak.hofBeiGruen===true, String(ak.hofBeiGruen));
  ok('Ohne Ergebnis bleibt der Raum dunkel', ak.hofOhneErgebnis===false, String(ak.hofOhneErgebnis));

  /* Beim Loslassen des Reglers laeuft die volle Probe: die Ampel blitzt auf
     UND der Schein schwillt an und ab - genau wie im Spiel beim Ergebnis.
     Lutz am 15.09.2026: "wenn ich's loslasse, sieht man aber nicht, wie die
     Ampel blinkt ... und auch das Aufleuchten vom Hintergrund ist jetzt weg."
     Beim ZIEHEN steht der Schein dagegen still, damit man seine Staerke
     vergleichen kann - zwei verschiedene Bilder, beide gebraucht. */
  abschnitt='Ampelprobe';
  const apr=await page.evaluate(async()=>{
    const erg={};
    ampelKraftSetzen(8,false); ampelBlattAuf();
    await new Promise(r=>setTimeout(r,700));
    const hof=$('ampelhof'), blatt=$('ampelBlatt');
    /* Der Schein sitzt bei 82 % der Hoehe, das Blatt beginnt bei rund 57 % -
       ohne Hochheben waere er beim Einstellen vollstaendig verdeckt.
       Gemessen: Zentrum y=692, Blattkante y=482, z-index 12 gegen 22. */
    erg.blattOben=Math.round(blatt.getBoundingClientRect().top);
    erg.scheinMitte=Math.round(window.innerHeight*0.82);
    erg.waereVerdeckt=erg.scheinMitte>erg.blattOben;
    erg.hofVorn=+getComputedStyle(hof).zIndex>+getComputedStyle(blatt).zIndex;
    /* Ziehen: still halten, kein Anlaufen. */
    hof.classList.remove('an','halten');
    $('ampelRegler').value='9';
    $('ampelRegler').dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,120));
    erg.beimZiehen={halten:hof.classList.contains('halten'),an:hof.classList.contains('an')};
    /* Loslassen: volle Probe. */
    $('ampelRegler').dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,90));
    erg.beimLoslassen={an:hof.classList.contains('an'),halten:hof.classList.contains('halten'),
      blitzt:[...document.querySelectorAll('.aprobe')].every(e=>e.classList.contains('blitzt'))};
    await new Promise(r=>setTimeout(r,1100));
    erg.danach={an:hof.classList.contains('an'),
      blitzt:[...document.querySelectorAll('.aprobe')].some(e=>e.classList.contains('blitzt'))};
    /* Zugemacht muss der Schein weg sein - er gehoert zum Einstellen. */
    ampelBlattZu();
    await new Promise(r=>setTimeout(r,120));
    erg.nachSchliessen={vor:hof.classList.contains('vor'),an:hof.classList.contains('an'),
      halten:hof.classList.contains('halten')};
    /* Auf der untersten Stufe gibt es nichts vorzufuehren. */
    ampelKraftSetzen(0,false); ampelBlattAuf();
    await new Promise(r=>setTimeout(r,700));
    erg.stufeNullHof=hof.classList.contains('an')||hof.classList.contains('halten');
    erg.stufeNullBlitzt=[...document.querySelectorAll('.aprobe')].some(e=>e.classList.contains('blitzt'));
    ampelBlattZu(); ampelKraftSetzen(0,true);
    return erg; });
  console.log('INFO Ampelprobe: '+JSON.stringify(apr));
  ok('Der Schein laege sonst unter dem Blatt',
     apr.waereVerdeckt===true, 'Mitte y='+apr.scheinMitte+', Blattkante y='+apr.blattOben);
  ok('Beim Einstellen liegt er deshalb vor dem Blatt', apr.hofVorn===true, String(apr.hofVorn));
  ok('Beim Ziehen steht der Schein still',
     apr.beimZiehen.halten===true&&apr.beimZiehen.an===false, JSON.stringify(apr.beimZiehen));
  ok('Beim Loslassen blitzen die Proben',
     apr.beimLoslassen.blitzt===true, String(apr.beimLoslassen.blitzt));
  ok('Beim Loslassen schwillt der Schein an',
     apr.beimLoslassen.an===true&&apr.beimLoslassen.halten===false, JSON.stringify(apr.beimLoslassen));
  ok('Danach ist beides wieder ruhig',
     apr.danach.an===false&&apr.danach.blitzt===false, JSON.stringify(apr.danach));
  ok('Zugemacht bleibt kein Schein zurueck',
     apr.nachSchliessen.vor===false&&apr.nachSchliessen.an===false&&apr.nachSchliessen.halten===false,
     JSON.stringify(apr.nachSchliessen));
  /* Blitzen soll die Probe auch auf Stufe 0 - nur der Schein im Bild bleibt
     dort aus, den gibt es auf dieser Stufe nicht. */
  ok('Auf der untersten Stufe bleibt der Raum dunkel',
     apr.stufeNullHof===false, String(apr.stufeNullHof));
  ok('Die Ampel blitzt trotzdem zur Probe',
     apr.stufeNullBlitzt===true, String(apr.stufeNullBlitzt));

  /* Rot faerbt den GANZEN Bildschirm, Gruen und Gelb nur den Streifen unten
     (Wunsch von Lutz, 15.09.2026: "bei Rot muss bitte der ganze Bildschirm
     aufflackern"). Entscheidend ist die Form des Verlaufs: der rote wird nach
     aussen STAERKER (wie der Warnblitz), der andere laeuft nach aussen aus.
     Gemessen wird oben und unten getrennt - eine Pruefung auf die Klasse
     allein saehe den Unterschied nicht. */
  abschnitt='Ampelhof Rot';
  await page.evaluate(()=>{ ampelBlattZu(); ampelKraftSetzen(10,false);
    $('ampelhof').classList.remove('an','halten','rot','vor'); });
  await sleep(350);
  const rOben={x:0,y:0,width:390,height:200}, rUnten={x:0,y:640,width:390,height:200};
  const rGO=PNG.sync.read(await page.screenshot({clip:rOben}));
  const rGU=PNG.sync.read(await page.screenshot({clip:rUnten}));
  const mittelAb=(a,g)=>{ let s=0; for(let k=0;k<a.data.length;k+=4)
    s+=Math.abs(a.data[k]-g.data[k])+Math.abs(a.data[k+1]-g.data[k+1])+Math.abs(a.data[k+2]-g.data[k+2]);
    return Math.round(s/(a.data.length/4)/3); };
  async function hofMessen(fn){
    await page.evaluate(fn); await sleep(150);
    const o=PNG.sync.read(await page.screenshot({clip:rOben}));
    const u=PNG.sync.read(await page.screenshot({clip:rUnten}));
    const w={oben:mittelAb(o,rGO),unten:mittelAb(u,rGU)};
    await page.evaluate(()=>{ $('ampelhof').classList.remove('an','halten');
      $('warnblitz').classList.remove('an'); });
    await sleep(320);
    return w;
  }
  const hGruen=await hofMessen(()=>ampelHof('ok'));
  const hGelb =await hofMessen(()=>ampelHof('warn'));
  const hRot  =await hofMessen(()=>ampelHof('bad'));
  const hWarn =await hofMessen(()=>{ settings.alarm=true; warnblitz(true); });
  console.log('INFO Ampelhof Rot: gruen='+JSON.stringify(hGruen)+' gelb='+JSON.stringify(hGelb)
    +' rot='+JSON.stringify(hRot)+' warnblitz='+JSON.stringify(hWarn));
  ok('Gruen bleibt unten, oben passiert nichts',
     hGruen.oben===0&&hGruen.unten>4, JSON.stringify(hGruen));
  ok('Gelb bleibt unten, oben passiert nichts',
     hGelb.oben===0&&hGelb.unten>4, JSON.stringify(hGelb));
  ok('Rot faerbt auch den oberen Bildschirm',
     hRot.oben>20, JSON.stringify(hRot));
  /* Es soll sich anfuehlen wie der Warnblitz, den Lutz von frueher kennt. */
  ok('Rot ist etwa so kraeftig wie der Warnblitz',
     Math.abs(hRot.oben-hWarn.oben)<=hWarn.oben*0.4,
     'rot oben '+hRot.oben+' gegen Warnblitz oben '+hWarn.oben);
  const rKl=await page.evaluate(async()=>{
    const e=$('ampelhof'), erg={};
    ampelHof('bad'); erg.beiRot=e.classList.contains('rot');
    await new Promise(r=>setTimeout(r,60));
    e.classList.remove('an'); ampelHof('ok'); erg.beiGruen=e.classList.contains('rot');
    e.classList.remove('an','halten');
    /* Unterhalb der Einsatzstufe bleibt auch Rot aus - wer nichts einstellt,
       merkt nichts, und der Warnblitz kommt dort ohnehin weiter. */
    ampelKraftSetzen(1,false); ampelHof('bad');
    erg.unterhalb=e.classList.contains('an')||e.classList.contains('halten');
    /* Lief der Warnblitz gerade, tritt Rot weiter zurueck. */
    ampelKraftSetzen(10,false); e.classList.remove('an','halten');
    warnblitzZeit=Date.now(); ampelHof('bad');
    erg.hinterWarnblitz=e.classList.contains('an');
    warnblitzZeit=0; e.classList.remove('an','halten','rot');
    ampelKraftSetzen(0,true);
    return erg; });
  console.log('INFO Ampelhof Rot Klassen: '+JSON.stringify(rKl));
  ok('Die rote Form wird gesetzt und wieder abgelegt',
     rKl.beiRot===true&&rKl.beiGruen===false, JSON.stringify(rKl));
  ok('Unter der Einsatzstufe bleibt auch Rot aus', rKl.unterhalb===false, String(rKl.unterhalb));
  ok('Nach einem Warnblitz tritt Rot weiterhin zurueck',
     rKl.hinterWarnblitz===false, String(rKl.hinterWarnblitz));

  /* Und die Frage, die zaehlt: waechst der Schein sichtbar mit der Stufe?
     Ein groesserer Weichzeichner allein macht ihn nur breiter und dabei
     flacher - gemessen sank die staerkste Abweichung dabei von 33 auf 23. */
  await page.evaluate(()=>{ ampelBlattZu(); setStatus('1 Stein bleibt erreichbar','ok'); });
  await sleep(320);
  const akBox=await page.evaluate(()=>{ const r=statusEl.querySelector('.dot').getBoundingClientRect();
    /* Der Rand muss geklemmt werden: die Ampel steht bei x=20, ein negativer
       Ausschnitt liefert stillschweigend immer dasselbe Bild (einmal erlebt). */
    return {x:Math.max(0,Math.round(r.x)-40),y:Math.max(0,Math.round(r.y)-40),
            width:Math.round(r.width)+80,height:Math.round(r.height)+80}; });
  const akBild=async n=>{ await page.evaluate(k=>ampelKraftSetzen(k,false),n); await sleep(300);
    return PNG.sync.read(await page.screenshot({clip:akBox})); };
  const akGrund=await akBild(0);
  const akFlaeche=[], akSpitze=[];
  for(const n of [2,4,7,10]){
    const bn=await akBild(n);
    let max=0,zahl=0;
    for(let k=0;k<bn.data.length;k+=4){
      const d=Math.max(Math.abs(bn.data[k]-akGrund.data[k]),
                       Math.abs(bn.data[k+1]-akGrund.data[k+1]),
                       Math.abs(bn.data[k+2]-akGrund.data[k+2]));
      if(d>max)max=d; if(d>8)zahl++;
    }
    akFlaeche.push(zahl); akSpitze.push(max);
  }
  await page.evaluate(()=>ampelKraftSetzen(0,true));
  console.log('INFO Ampelkraft sichtbar: Flaeche='+JSON.stringify(akFlaeche)+' Spitze='+JSON.stringify(akSpitze));
  ok('Jede Stufe leuchtet sichtbar weiter als die vorige',
     akFlaeche.every((v,i)=>i===0?v>200:v>akFlaeche[i-1]), JSON.stringify(akFlaeche));
  ok('Der Kern wird dabei nicht flauer',
     Math.min(...akSpitze)>=40, 'staerkste Abweichungen '+JSON.stringify(akSpitze));

  /* Die Umstellung von der Fuenfer-Skala (v1.43) auf die Elfer (v1.44) MUSS
     mit einem wirklich gespeicherten Wert geprueft werden, nicht nur mit dem
     Standard. Genau daran haette es einmal gelegen: die Umrechnung stand
     oben bei den settings, wo AMPEL_MAX noch in der temporalen Totzone
     liegt. Mit Standardwert 0 laeuft die Zeile nie (der Filter davor ist
     falsch) und alles wirkt heil - wer aber eine Stufe gespeichert hatte,
     bekam "ReferenceError: Cannot access AMPEL_MAX before initialization"
     und die App startete GAR NICHT. Gemessen, nicht vermutet. */
  abschnitt='Ampelskala-Umstellung';
  {
    const pm=await browser.newPage();
    const kaputt=[]; pm.on('pageerror',e=>kaputt.push(String(e).split('\n')[0]));
    await pm.setViewport({width:390,height:844});
    await pm.evaluateOnNewDocument(()=>{ try{ localStorage.setItem('solitaire.settings',
      JSON.stringify({ampelKraft:4,anGestellt:true})); }catch(e){} });
    await pm.goto('file://'+path.resolve(__dirname,'..','index.html'),{waitUntil:'load'});
    await sleep(1800);
    const m=await pm.evaluate(()=>({
      laeuft:typeof game!=='undefined'&&!!game.board,
      kraft:typeof settings!=='undefined'?settings.ampelKraft:null,
      skala:typeof settings!=='undefined'?settings.ampelSkala:null
    })).catch(()=>({laeuft:false,kraft:null,skala:null}));
    console.log('INFO Ampelskala: '+JSON.stringify(m)+' Fehler: '+(kaputt[0]||'keine'));
    ok('Die App startet auch mit einer gespeicherten alten Stufe',
       m.laeuft===true&&kaputt.length===0, JSON.stringify(m)+' / '+(kaputt[0]||'keine'));
    /* Seit v1.47 stellt eine zweite, einmalige Umstellung ab Werk auf 6 -
       die laeuft NACH der Skalen-Umrechnung und ueberschreibt sie bewusst
       (Wunsch von Lutz). Geprueft wird deshalb der Endzustand. */
    ok('Nach beiden Umstellungen steht die Ampel auf 6', m.kraft===6, String(m.kraft));
    ok('Die Umstellung merkt sich, dass sie gelaufen ist', m.skala===2, String(m.skala));
    await pm.close();
    /* Gegenprobe: wer schon auf der neuen Skala steht, wird nicht noch einmal
       umgerechnet - sonst wanderte die Einstellung bei jedem Start hoch. */
    const pm2=await browser.newPage();
    await pm2.setViewport({width:390,height:844});
    await pm2.evaluateOnNewDocument(()=>{ try{ localStorage.setItem('solitaire.settings',
      JSON.stringify({ampelKraft:8,ampelSkala:2,ampelStd:6,anGestellt:true})); }catch(e){} });
    await pm2.goto('file://'+path.resolve(__dirname,'..','index.html'),{waitUntil:'load'});
    await sleep(1600);
    const m2=await pm2.evaluate(()=>settings.ampelKraft).catch(()=>null);
    ok('Eine schon umgestellte Einstellung bleibt, wo sie ist', m2===8, String(m2));
    await pm2.close();
  }

  /* Probierte Zuege (v1.47). Nimmt man einen Zug zurueck, bleibt er als
     duenner roter Strich stehen. Zweck nach Lutz (15.09.2026): "dass ich sehe,
     welchen Zug ich schon probiert habe, wenn ich den gleichen Zug mehrfach
     falsch mache". Gemerkt wird je STELLUNG, nicht je Zugnummer. */
  abschnitt='Probierte Zuege';
  const pz=await page.evaluate(async()=>{
    const erg={};
    const striche=()=>document.querySelectorAll('#board path.probiert').length;
    settings.probiert=true; settings.autoJump=false; newGame('english');
    await new Promise(r=>setTimeout(r,80));
    erg.amAnfang=striche();
    const m1=game.board.moves.find(m=>game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0);
    applyMove(m1,true); render(); undo();
    await new Promise(r=>setTimeout(r,1400));
    erg.nachEinem=striche();
    /* Ein zweiter, ANDERER Zug aus derselben Stellung kommt dazu - genau das
       ist der Zweck: sehen, was man hier schon alles versucht hat. */
    const m2=game.board.moves.find(m=>m!==m1&&game.pegAt[m.from]>=0
      &&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0);
    applyMove(m2,true); render(); undo();
    await new Promise(r=>setTimeout(r,1400));
    erg.nachZweien=striche();
    /* Derselbe Zug nochmal zaehlt nicht doppelt. */
    applyMove(m1,true); render(); undo();
    await new Promise(r=>setTimeout(r,1400));
    erg.wiederholt=striche();
    /* Ein Zug fuehrt in eine andere Stellung - dort ist die Tafel leer. */
    applyMove(m1,true); render();
    await new Promise(r=>setTimeout(r,80));
    erg.nachZug=striche();
    /* Zurueck an dieselbe Stelle: die eigenen Versuche stehen wieder da. */
    undo(); await new Promise(r=>setTimeout(r,1400));
    erg.zurueck=striche();
    /* Abgeschaltet verschwinden sie sofort. */
    settings.probiert=false; renderOverlay();
    erg.abgeschaltet=striche();
    settings.probiert=true; newGame('english');
    await new Promise(r=>setTimeout(r,80));
    erg.neuesSpiel=striche();
    return erg; });
  console.log('INFO Probierte Zuege: '+JSON.stringify(pz));
  ok('Am Anfang ist die Tafel leer', pz.amAnfang===0, String(pz.amAnfang));
  ok('Ein zurueckgenommener Zug bleibt stehen', pz.nachEinem===1, String(pz.nachEinem));
  ok('Ein zweiter Versuch kommt dazu', pz.nachZweien===2, String(pz.nachZweien));
  ok('Derselbe Zug zaehlt nicht doppelt', pz.wiederholt===2, String(pz.wiederholt));
  ok('Nach einem Zug ist die neue Stellung leer', pz.nachZug===0, String(pz.nachZug));
  ok('Zurueck stehen die eigenen Versuche wieder da', pz.zurueck===2, String(pz.zurueck));
  ok('Abgeschaltet verschwinden sie sofort', pz.abgeschaltet===0, String(pz.abgeschaltet));
  ok('Ein neues Spiel raeumt sie ab', pz.neuesSpiel===0, String(pz.neuesSpiel));

  /* Nach zwei Sekunden tritt die grosse Markierung zurueck und laesst nur den
     Strich stehen - sonst deckt sie beim Nachdenken zu, was man vergleichen
     will. Der Timer haengt an SEINER Markierung: kommt inzwischen ein
     Vor-Zug, gehoert sie dem und muss bleiben (einmal falsch gebaut, der rote
     Pfeil des Vor-Zuges verschwand nach 2 s). */
  const pzT=await page.evaluate(async()=>{
    const erg={};
    settings.probiert=true; settings.autoJump=false; newGame('english');
    const m=game.board.moves.find(m=>game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0);
    applyMove(m,true); render(); undo();
    /* Das Spulen braucht 400 ms Vorlauf + 650 ms; erst danach steht die
       Stellung, der der Versuch gehoert, und erst dann laeuft der Timer an. */
    await new Promise(r=>setTimeout(r,1400));
    erg.gleichDanach={gross:!game.markAus&&!!game.lastMove,
      striche:document.querySelectorAll('#board path.probiert').length};
    await new Promise(r=>setTimeout(r,2400));
    erg.nachZweiSekunden={gross:!game.markAus&&!!game.lastMove,
      striche:document.querySelectorAll('#board path.probiert').length};
    /* Jetzt die Gegenprobe: Vor-Zug direkt nach dem Zurueck. */
    newGame('english');
    applyMove(m,true); render(); undo();
    await new Promise(r=>setTimeout(r,1400));
    redo();
    await new Promise(r=>setTimeout(r,2600));
    erg.nachVorZug={gross:!game.markAus&&!!game.lastMove};
    settings.autoJump=true; newGame('english');
    return erg; });
  console.log('INFO Probierte Zuege Zeit: '+JSON.stringify(pzT));
  ok('Gleich nach dem Zurueck steht die grosse Markierung',
     pzT.gleichDanach.gross===true&&pzT.gleichDanach.striche===1, JSON.stringify(pzT.gleichDanach));
  ok('Nach zwei Sekunden bleibt nur der Strich',
     pzT.nachZweiSekunden.gross===false&&pzT.nachZweiSekunden.striche===1,
     JSON.stringify(pzT.nachZweiSekunden));
  ok('Die Markierung eines Vor-Zuges bleibt dagegen stehen',
     pzT.nachVorZug.gross===true, JSON.stringify(pzT.nachVorZug));

  /* Und die Frage, die zaehlt: sieht man die Striche? */
  await page.evaluate(async()=>{
    settings.probiert=true; settings.autoJump=false; newGame('english');
    await new Promise(r=>setTimeout(r,80)); });
  await sleep(250);
  const pzBox={x:0,y:80,width:390,height:420};
  const pzGrund=PNG.sync.read(await page.screenshot({clip:pzBox}));
  await page.evaluate(async()=>{
    const m=game.board.moves.find(m=>game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0);
    applyMove(m,true); render(); undo();
    await new Promise(r=>setTimeout(r,3600));    // Spulen plus zwei Sekunden
    game.markAus=true; renderOverlay(); });
  await sleep(300);
  const pzJetzt=PNG.sync.read(await page.screenshot({clip:pzBox}));
  let pzRot=0, pzKraeftig=0, pzMax=0;
  for(let k=0;k<pzJetzt.data.length;k+=4){
    const dr=pzJetzt.data[k]-pzGrund.data[k];
    if(dr>18&&pzJetzt.data[k]>pzJetzt.data[k+1]+30){
      pzRot++; if(dr>100) pzKraeftig++; if(dr>pzMax)pzMax=dr; }
  }
  console.log('INFO Probierte Zuege sichtbar: '+pzRot+' rote Bildpunkte, davon '
    +pzKraeftig+' kraeftig, staerkster '+pzMax);
  ok('Der Strich ist wirklich zu sehen', pzRot>300, pzRot+' rote Bildpunkte');
  /* Die Flaeche allein reicht als Pruefgroesse nicht: v1.47 hatte Striche in
     der richtigen Groesse, nur mit opacity .5 - Lutz sah sie kaum. Der
     MITTELWERT taugt auch nicht: er sinkt, sobald die Flaeche waechst, weil
     mehr weiche Randpunkte hineinzaehlen (im Test 97 gegen 129 bei derselben
     Farbe, nur mehr Strichen). Gezaehlt wird deshalb, wie viele Punkte
     WIRKLICH kraeftig sind - bei der alten Fassung war der staerkste ueberhaupt
     nur 84, also keiner ueber 100. */
  ok('Und kraeftig genug, um aufzufallen',
     pzKraeftig>200&&pzMax>=150, pzKraeftig+' kraeftige Punkte, staerkster '+pzMax);
  /* Und die zweite Frage - die eigentliche seit v1.52: SIEHT man die
     Richtung? Ein Dreieck, das seine Richtung nur im SVG hat, waere derselbe
     Fehlertyp wie der unsichtbare Glanz in v1.39: richtig gemessen, falsche
     Frage. Gemessen wird deshalb die rote Breite QUER zur Zugrichtung, einmal
     nahe am Start und einmal nahe am Ziel. Beim Strich mit zwei gleichen
     Punkten waeren beide gleich; beim Dreieck muss die vordere deutlich
     schmaler sein. */
  const pzQuer=await page.evaluate(box=>{
    const pfad=document.querySelector('#board path.probiert');
    if(!pfad) return null;
    const z=pfad.getAttribute('d').match(/-?\d+(\.\d+)?/g).map(Number);
    const A={x:z[0],y:z[1]}, B={x:z[2],y:z[3]}, C={x:z[4],y:z[5]};
    const pa={x:(A.x+B.x)/2, y:(A.y+B.y)/2};          // Mitte der Basis = Startfeld
    const dx=C.x-pa.x, dy=C.y-pa.y, L=Math.hypot(dx,dy);
    const ux=dx/L, uy=dy/L, nx=-uy, ny=ux;
    const ctm=pfad.getScreenCTM();
    const um=q=>({x:ctm.a*q.x+ctm.c*q.y+ctm.e-box.x, y:ctm.b*q.x+ctm.d*q.y+ctm.f-box.y});
    /* Ein Querschnitt bei Anteil t der Strecke, 41 Proben ueber +-40 Einheiten. */
    const quer=t=>{ const m={x:pa.x+ux*L*t, y:pa.y+uy*L*t}; const pts=[];
      for(let i=-20;i<=20;i++){ const d=i*2;
        pts.push(um({x:m.x+nx*d, y:m.y+ny*d})); }
      return pts; };
    return {nahStart:quer(0.18), nahZiel:quer(0.82),
            basis:Math.round(Math.hypot(A.x-B.x,A.y-B.y)), laenge:Math.round(L)};
  },pzBox);
  const rotDa=(png,p)=>{ const i=((Math.round(p.y*2)*png.width)+Math.round(p.x*2))*4;
    if(i<0||i+2>=png.data.length) return false;
    return png.data[i]-png.data[i+1]>60; };
  const qStart=pzQuer.nahStart.filter(p=>rotDa(pzJetzt,p)).length;
  const qZiel=pzQuer.nahZiel.filter(p=>rotDa(pzJetzt,p)).length;
  console.log('INFO Querschnitte: nah am Start '+qStart+' von 41, nah am Ziel '
    +qZiel+' von 41 (Basis '+pzQuer.basis+', Laenge '+pzQuer.laenge+')');
  ok('Am Ausgangsfeld ist das Dreieck breit', qStart>=7, qStart+' von 41 Proben rot');
  ok('Zum Zielfeld hin wird es schmaler', qZiel>=1&&qZiel*2<=qStart,
     'Start '+qStart+', Ziel '+qZiel);
  /* Die Basis ist halb so breit wie ein Spielstein (Vorgabe aus Lutz' Entwurf):
     Murmelradius 34, also 68 breit - die Basis misst 34. */
  ok('Die Basis ist halb so breit wie ein Spielstein', pzQuer.basis===34, String(pzQuer.basis));

  abschnitt='Form des probierten Zuges';
  /* Seit v1.52 EIN Dreieck statt Strich plus zwei Punkte. Geprueft wird die
     Geometrie: drei Ecken, die Basis quer ueber dem Ausgangsfeld, die Spitze
     genau im Zielfeld - und keine Punkte mehr. Die Richtung selbst wird oben
     an den Bildpunkten gemessen, denn die Zahl der Ecken sagt darueber nichts. */
  const pe=await page.evaluate(async()=>{
    settings.probiert=true; settings.autoJump=false; newGame('english');
    await new Promise(r=>setTimeout(r,80));
    const m=game.board.moves.find(m=>game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0);
    applyMove(m,true); render(); undo();
    await new Promise(r=>setTimeout(r,1400));
    const lay=game.lay;
    const erg={punkte:document.querySelectorAll('#board circle.probiertEnde').length,
               ringe:document.querySelectorAll('.probiertZiel').length,
               dreiecke:document.querySelectorAll('#board path.probiert').length};
    const pfad=document.querySelector('#board path.probiert');
    if(pfad){
      const d=pfad.getAttribute('d');
      erg.geschlossen=/Z\s*$/.test(d.trim());
      const z=d.match(/-?\d+(\.\d+)?/g).map(Number);
      erg.ecken=z.length/2;
      const A={x:z[0],y:z[1]}, B={x:z[2],y:z[3]}, C={x:z[4],y:z[5]};
      const pv=lay.pos[m.from], pz=lay.pos[m.to];
      /* Die Basismitte liegt im Ausgangsfeld, die Spitze im Zielfeld. */
      erg.basisMitte=+Math.hypot((A.x+B.x)/2-pv.x,(A.y+B.y)/2-pv.y).toFixed(2);
      erg.spitzeImZiel=+Math.hypot(C.x-pz.x,C.y-pz.y).toFixed(2);
      erg.basis=+Math.hypot(A.x-B.x,A.y-B.y).toFixed(1);
      /* Die Basis steht senkrecht auf der Zugrichtung - sonst waere das
         Dreieck verzogen und zeigte schief. */
      const bx=B.x-A.x, by=B.y-A.y, ux=pz.x-pv.x, uy=pz.y-pv.y;
      erg.senkrecht=+Math.abs((bx*ux+by*uy)/(Math.hypot(bx,by)*Math.hypot(ux,uy))).toFixed(3);
    }
    settings.autoJump=true;
    return erg; });
  console.log('INFO Form: '+JSON.stringify(pe));
  ok('Ein Dreieck mit drei Ecken', pe.dreiecke===1&&pe.ecken===3&&pe.geschlossen===true, JSON.stringify(pe));
  ok('Keine Punkte und kein Ring mehr', pe.punkte===0&&pe.ringe===0, JSON.stringify(pe));
  ok('Die Basis liegt im Ausgangsfeld', pe.basisMitte<0.5, String(pe.basisMitte));
  ok('Die Spitze sitzt im Zielfeld', pe.spitzeImZiel<0.5, String(pe.spitzeImZiel));
  ok('Die Basis steht senkrecht zur Zugrichtung', pe.senkrecht<0.01, String(pe.senkrecht));
  /* Die Spitze laeuft auf null zusammen, das leere Loch (Radius 25) bleibt
     also lesbar - das war der Grund, aus dem v1.49 den Ring abgeloest hat. */
  ok('Am Ziel verdeckt nichts das leere Feld', pe.basis>20&&pe.spitzeImZiel<0.5,
     'Basis '+pe.basis+', Spitze genau im Feld');

  abschnitt='Hauptschalter Computer';
  /* v1.54 (Lutz, 17.09.2026): Trainer, Strategie-Hinweise und Markierung
     werden EIN Schalter. Aus heisst "wie am echten Brett": keine Ampel, kein
     Blitz, keine Erklaerung, keine Zeichen, keine Dreiecke - nur Vor und
     Zurueck. Vorher hing der Warnblitz am Rechner, hatte aber einen
     Schalter, der so tat, als waere er unabhaengig: Markierung an, Trainer
     und Strategie aus -> es blitzte, und die Zeile blieb leer. */
  const hs=await page.evaluate(async()=>{
    const erg={};
    settings.autoJump=false; settings.alarm=true; settings.marks=true; settings.probiert=true; settings.tipps=true;
    computerSetzen(false); newGame('english');
    for(let k=0;k<12;k++){ const l=currentLine(); applyMove(game.board.moves[l.path[0]],true); } render();
    const dot=document.querySelector('#status .dot');
    erg.ampelWeg=getComputedStyle(dot).display==='none';
    erg.chip=document.getElementById('btnComputer').textContent;
    /* Fehlzug: einer, der 1 unmoeglich macht */
    const legal=game.board.moves.filter(m=>game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0);
    let culprit=null;
    for(const m of legal){ const c=occ(); c[m.from]=0;c[m.over]=0;c[m.to]=1; const [lo,hi]=CORE.fromArray(c);
      const rr=CORE.solveSmart(game.board,lo,hi,19,{maxNodes:0,timeMs:8000,target:1}); if(rr.best>1){ culprit=m; break; } }
    const blitzVor=warnblitzZeit||0;
    playMove(culprit); await new Promise(r=>setTimeout(r,2500));
    erg.blitz=(warnblitzZeit||0)>blitzVor; erg.bewertet=!!game.evalRes; erg.status=statusFullText();
    erg.zeichen=document.querySelectorAll('#board .mark, #board .marke, #board [class*="gestrandet"]').length;
    undo(); await new Promise(r=>setTimeout(r,1400));
    erg.dreiecke=document.querySelectorAll('#board path.probiert').length;
    erg.undoGeht=game.history.length===12;
    /* Wieder an: alles kommt zurueck, ohne Neustart */
    computerSetzen(true); await new Promise(r=>setTimeout(r,2500));
    erg.ampelDa=getComputedStyle(dot).display!=='none';
    erg.bewertetDanach=!!game.evalRes; erg.chipAn=document.getElementById('btnComputer').textContent;
    settings.autoJump=true;
    return erg; });
  console.log('INFO Computer aus: '+JSON.stringify(hs));
  ok('Computer aus: die Ampel verschwindet', hs.ampelWeg===true, JSON.stringify(hs));
  ok('Computer aus: der Chip sagt es', hs.chip==='Computer: aus', hs.chip);
  ok('Computer aus: kein Warnblitz beim Fehlzug', hs.blitz===false, String(hs.blitz));
  ok('Computer aus: keine Bewertung, keine Erklaerung', hs.bewertet===false&&!/Fehler|Bestenfalls|erreichbar/.test(hs.status), hs.status);
  ok('Computer aus: kein Dreieck nach dem Zuruecknehmen', hs.dreiecke===0, String(hs.dreiecke));
  ok('Computer aus: Zurueck geht trotzdem', hs.undoGeht===true);
  ok('Computer an: Ampel und Bewertung sind wieder da', hs.ampelDa&&hs.bewertetDanach&&hs.chipAn==='Computer: an', JSON.stringify(hs));

  abschnitt='Schalter Tipps';
  const ts=await page.evaluate(async()=>{
    const erg={}; newGame('english');
    settings.tipps=false; renderHud(); buildSheet();
    erg.knopfWeg=document.getElementById('btnHint').hidden===true;
    const vorher=game.tippKeys.size; requestHint(); await new Promise(r=>setTimeout(r,300));
    erg.keinTipp=game.tippKeys.size===vorher&&!game.hintOn;
    settings.tipps=true; renderHud();
    erg.knopfDa=document.getElementById('btnHint').hidden===false;
    return erg; });
  console.log('INFO Tipps aus: '+JSON.stringify(ts));
  ok('Tipps aus: der Tipp-Knopf ist weg', ts.knopfWeg===true);
  ok('Tipps aus: ein Tipp-Aufruf tut nichts und zaehlt nichts', ts.keinTipp===true);
  ok('Tipps an: der Knopf ist wieder da', ts.knopfDa===true);

  abschnitt='Menue Hilfe';
  const mh=await page.evaluate(()=>{ const erg={};
    erg.ueberschrift=[...document.querySelectorAll('#sheet h2')].map(h=>h.textContent);
    erg.keinTrainer=!document.getElementById('swTrainer');
    computerSetzen(false); buildSheet();
    erg.subWeg=[...document.querySelectorAll('.row.sub[data-sub="computer"]')].every(r=>r.hidden);
    erg.subZahl=document.querySelectorAll('.row.sub[data-sub="computer"]').length;
    computerSetzen(true); buildSheet();
    erg.subDa=[...document.querySelectorAll('.row.sub[data-sub="computer"]')].every(r=>!r.hidden);
    return erg; });
  console.log('INFO Menue Hilfe: '+JSON.stringify(mh));
  ok('Menue hat einen Abschnitt Hilfe', mh.ueberschrift.includes('Hilfe'), mh.ueberschrift.join(','));
  ok('Der Trainer-Schalter ist weg', mh.keinTrainer===true);
  ok('Unterpunkte verschwinden, wenn Computer aus ist', mh.subWeg===true&&mh.subZahl===4, JSON.stringify(mh));
  ok('Unterpunkte kommen mit Computer an zurueck', mh.subDa===true);

  abschnitt='Migration Hilfe';
  /* Wer vorher alles aus hatte, bekommt Computer aus; wer irgendetwas an
     hatte, an. Laeuft genau einmal - ein spaeteres Abschalten muss halten. */
  const mig=await (async()=>{
    await page.evaluate(()=>{ localStorage.setItem('solitaire.settings',JSON.stringify({trainer:false,strategy:false,marks:false,anGestellt:true,board:'english'})); });
    await page.reload({waitUntil:'load'}); await sleep(2800);
    const allesAus=await page.evaluate(()=>({c:settings.computer,flag:settings.hilfeSortiert}));
    await page.evaluate(()=>{ localStorage.setItem('solitaire.settings',JSON.stringify({trainer:false,strategy:true,marks:false,anGestellt:true,board:'english'})); });
    await page.reload({waitUntil:'load'}); await sleep(2800);
    const einesAn=await page.evaluate(()=>settings.computer);
    await page.evaluate(()=>{ settings.computer=false; saveSettings(); });
    await page.reload({waitUntil:'load'}); await sleep(2800);
    const bleibtAus=await page.evaluate(()=>settings.computer);
    await page.evaluate(()=>{ settings.computer=true; settings.tipps=true; saveSettings(); });
    return {allesAus,einesAn,bleibtAus}; })();
  console.log('INFO Migration Hilfe: '+JSON.stringify(mig));
  ok('Alles aus wird zu Computer aus', mig.allesAus.c===false&&mig.allesAus.flag===true, JSON.stringify(mig.allesAus));
  ok('Ein alter Schalter an wird zu Computer an', mig.einesAn===true);
  ok('Ein spaeteres Abschalten haelt', mig.bleibtAus===false);

  abschnitt='Migration';
  /* Trainer und Strategie-Hinweise sind ab Werk an. Ein geaenderter Standard
     allein reicht nicht: Object.assign zieht den gespeicherten Wert vor, und
     Lutz trug strategy:false seit der ersten Installation mit sich. Deshalb
     eine einmalige Umstellung - und zwar wirklich einmalig, ein spaeteres
     Abschalten muss halten. */
  const anAus=await (async()=>{
    await page.evaluate(()=>{ localStorage.setItem('solitaire.settings',JSON.stringify({trainer:false,strategy:false,board:'english'})); });
    await page.reload({waitUntil:'load'}); await sleep(2800);
    const nachMigration=await page.evaluate(()=>({t:settings.trainer,s:settings.strategy,flag:settings.anGestellt}));
    // Jetzt bewusst abschalten und neu laden - das muss bleiben
    await page.evaluate(()=>{ settings.trainer=false; settings.strategy=false; saveSettings(); });
    await page.reload({waitUntil:'load'}); await sleep(2800);
    const nachAbschalten=await page.evaluate(()=>({t:settings.trainer,s:settings.strategy}));
    await page.evaluate(()=>{ settings.trainer=true; settings.strategy=true; saveSettings(); });
    return {nachMigration,nachAbschalten}; })();
  console.log('INFO Trainer/Strategie: '+JSON.stringify(anAus));
  ok('Alte Einstellung wird einmalig auf Trainer und Strategie an gestellt',
     anAus.nachMigration.t===true&&anAus.nachMigration.s===true, JSON.stringify(anAus.nachMigration));
  ok('Wer sie danach abschaltet, behaelt das',
     anAus.nachAbschalten.t===false&&anAus.nachAbschalten.s===false, JSON.stringify(anAus.nachAbschalten));

  ok('keine Seitenfehler insgesamt', errors.length===0, errors.join(' | '));
  await browser.close();
  console.log(fails?`\n${fails} FEHLER`:'\nALLE BROWSER-TESTS OK'); process.exitCode=fails?1:0;
})().catch(e=>{ console.error('CRASH',e); process.exit(1); });
