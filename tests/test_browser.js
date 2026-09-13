const puppeteer=require(process.env.PUPPETEER_PATH||'puppeteer');
const path=require('path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(name,cond,extra)=>{ console.log((cond?'OK  ':'FAIL')+' '+name+(extra!==undefined?' -> '+extra:'')); if(!cond) fails++; };
(async()=>{
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--allow-file-access-from-files']});
  const page=await browser.newPage();
  await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errors=[]; page.on('pageerror',e=>errors.push('pageerror: '+e.message)); page.on('console',m=>{ if(m.type()==='error') errors.push('console: '+m.text()); });
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
  await page.evaluate(()=>{ settings.trainer=true; settings.marks=true; settings.strategy=false; renderStrategyBtn(); newGame('english'); });
  // dem Buch 12 Züge folgen (bleibt lösbar), dann bewerten lassen
  await page.evaluate(()=>{ for(let k=0;k<12;k++){ const l=currentLine(); applyMove(game.board.moves[l.path[0]],true); } render(); evaluatePosition(); });
  await page.waitForFunction(()=>!game.evaluating,{timeout:20000}); await sleep(100);
  s=await state(); console.log('INFO Trainer nach Buchzügen: '+s.status);
  ok('Trainer: noch lösbar erkannt', /1 Stein ist noch erreichbar/.test(s.status));
  // jetzt einen Zug spielen, der 1 verhindert: alle Züge durchprobieren, bis der Trainer "gekostet" meldet
  const legal=await page.evaluate(()=>game.board.moves.map((m,i)=>({i,ok:game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0})).filter(x=>x.ok).map(x=>x.i));
  let lostMsg=null;
  for(const mi of legal){ await page.evaluate(i=>{ applyMove(game.board.moves[i],true); render(); afterMove(true); },mi);
    await page.waitForFunction(()=>!game.evaluating,{timeout:20000}); await sleep(100); s=await state();
    if(/gekostet/.test(s.status)){ lostMsg=s.status; break; } await page.evaluate(()=>undo()); await sleep(1200); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000}); }
  console.log('INFO Trainer Fehlzug: '+lostMsg);
  // Zurück, Zurück, Vor, Vor: beim zweiten Vor muss wieder „gekostet" stehen
  await page.evaluate(()=>undo()); await sleep(1200); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000});
  await page.evaluate(()=>undo()); await sleep(1200); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000});
  await page.evaluate(()=>redo()); await sleep(1200); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000}); await sleep(100); const s1=(await state()).status;
  await page.evaluate(()=>redo()); await sleep(1200); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000}); await sleep(100); const s2=(await state()).status;
  console.log('INFO Vorspulen: 1) '+s1+' | 2) '+s2);
  ok('Vorspulen: erst grün, dann „gekostet"', /noch erreichbar/.test(s1)&&/gekostet/.test(s2));
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
  ok('Trainer meldet den verlorenen Zug mit Zurück-Link', !!lostMsg&&/Zurück/.test(lostMsg));
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
  await page.evaluate(()=>{ settings.trainer=false; settings.marks=false; newGame('english'); });
  // Strategie-Hinweise
  await page.evaluate(()=>{ settings.trainer=false; settings.marks=false; settings.strategy=true; renderStrategyBtn(); newGame('english'); for(let k=0;k<12;k++){ const l=currentLine(); applyMove(game.board.moves[l.path[0]],true); } render(); evaluatePosition(); });
  await page.waitForFunction(()=>!game.evaluating,{timeout:20000});
  const legal2=await page.evaluate(()=>game.board.moves.map((m,i)=>({i,ok:game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0})).filter(x=>x.ok).map(x=>x.i));
  let adv=null;
  for(const mi of legal2){ await page.evaluate(i=>{ applyMove(game.board.moves[i],true); render(); afterMove(true); },mi); await page.waitForFunction(()=>!game.evaluating,{timeout:20000}); await sleep(100); s=await state();
    if(/Strategischer Fehler/.test(s.status)){ adv=s.status; break; } await page.evaluate(()=>undo()); await sleep(1300); await page.waitForFunction(()=>!game.animating&&!game.evaluating,{timeout:20000}); }
  console.log('INFO Strategie: '+adv);
  ok('Strategie-Hinweis mit Klasse, Begründung und besserem Zug', !!adv&&/(Reihenfolge|Falsche Richtung|Stein gestrandet|Struktur)/.test(adv)&&/Besser: /.test(adv)&&/Zurück & Zug zeigen/.test(adv));
  await page.evaluate(()=>{ [...statusEl.querySelectorAll('.link')].find(l=>/Zurück & Zug/.test(l.textContent)).click(); }); await sleep(1400); await page.waitForFunction(()=>!game.animating,{timeout:20000}); await sleep(200);
  const shown=await page.evaluate(()=>({hint:game.hintOn&&!!document.querySelector('#board .hint-arrow'),status:statusFullText(),moves:game.history.length}));
  console.log('INFO nach Zurück & Zug zeigen: '+JSON.stringify(shown));
  ok('Zurück & Zug zeigen: Zug zurück, besserer Zug als Pfeil', shown.hint&&shown.moves===12&&/bessere Zug ist markiert/.test(shown.status));
  ok('Strategie-Knopf sichtbar und an', await page.evaluate(()=>document.getElementById('btnStrategy').classList.contains('on')));
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
  await page.evaluate(()=>{ settings.trainer=true; settings.strategy=true; newGame('english');
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
  await page.evaluate(()=>{ settings.trainer=false; settings.marks=false; settings.strategy=true; renderStrategyBtn(); });
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
  // Die lauteste Stimme des Alarms gibt die wahrgenommene Lautstaerke vor;
  // leisere Begleitstimmen (Fundament) duerfen darunter liegen.
  ok('Alarmton ist nicht leiser als der Sprungton',
     Math.max.apply(null,toene.alarm.map(t=>t.gain))>=toene.jump,
     JSON.stringify(toene.alarm.map(t=>t.gain))+' gegen '+toene.jump);
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
      Sound.tone=(f0,f1,d,t,g,w)=>{ ruf.push({wirk:g*(FORM[t]||0.7),ab:w||0,ende:(w||0)+d}); };
      Sound.alarm(); const dauer=alarmDauer();
      erg[k]={n:ruf.length,lautest:ruf.length?Math.max(...ruf.map(x=>x.wirk)):0,
        frueheste:ruf.length?Math.min(...ruf.map(x=>x.ab)):null,
        letztesEnde:ruf.length?Math.max(...ruf.map(x=>x.ende)):0,dauer}; });
    Sound.tone=ot; settings.alarmTon=merk; return erg; });
  console.log('INFO Alarmtoene: '+JSON.stringify(alle));
  const wahl=Object.keys(alle).filter(k=>k!=='aus');
  /* Bezug ist der Saegezahn-Alarm: der lief seit v1.17 im Spiel und war fuer
     Lutz hoerbar. Kein neuer Ton darf darunter liegen. */
  ok('Kein waehlbarer Alarm ist leiser als der bewaehrte Saegezahn-Alarm',
     wahl.every(k=>alle[k].lautest>=alle.saege.lautest*0.99),
     JSON.stringify(wahl.map(k=>k+':'+alle[k].lautest.toFixed(3)))+' gegen '+alle.saege.lautest.toFixed(3));
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
  await page.evaluate(()=>{ [...statusEl.querySelectorAll('.link')].find(l=>/Fehler suchen/.test(l.textContent)).click(); });
  await page.waitForFunction(()=>/entscheidende Fehler|nicht mehr erreichbar|abgebrochen/.test(statusFullText()),{timeout:60000}); await sleep(100);
  s=await state(); console.log('INFO Fehlersuche: '+s.status);
  ok('Fehlersuche nennt Zug 13 mit besserem Zug', /Zug war Zug 13 von 15/.test(s.status)&&/Besser war/.test(s.status));
  await page.evaluate(()=>{ [...statusEl.querySelectorAll('.link')].find(l=>/Dorthin zurück/.test(l.textContent)).click(); }); await sleep(300);
  const rw=await page.evaluate(()=>({moves:game.history.length,hint:game.hintOn&&!!document.querySelector('#board .hint-arrow'),future:game.future.length}));
  ok('Zurückgespult auf Zug 12, besserer Zug markiert, Vor-Verlauf erhalten', rw.moves===12&&rw.hint&&rw.future===3, JSON.stringify(rw));
  await page.evaluate(()=>{ settings.strategy=false; renderStrategyBtn(); newGame('english'); });
  // Längste Farbnamen passen in eine Zeile
  const fit=await page.evaluate(()=>{ const names=Object.values(HEX_NAMES).sort((a,b)=>b.length-a.length); const L=names[0];
    const st=document.getElementById('status');
    const cases=['Vor: '+L+' springt über '+L+'.','Zurück: '+L+' zurück, '+L+' wieder da.','Zurück: Stein zurück, Geschlagener wieder da.'];
    return cases.map(t=>{ setStatus(t); const k=st.querySelector('.kurz');
      return {gezeigt:k.textContent, platz:Math.round(k.clientWidth), gebraucht:Math.round(k.scrollWidth)}; }); });
  console.log('INFO Spultexte: '+JSON.stringify(fit));
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
     chips.n===6&&chips.namen.includes('Gong')&&chips.namen.includes('Aus'), JSON.stringify(chips.namen));
  ok('Genau der eingestellte Ton ist markiert',
     chips.gewaehlt.length===1&&chips.gewaehlt[0]==='Gong', JSON.stringify(chips.gewaehlt));
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
  const lutzZug=async(strategie)=>{
    await page.evaluate(st=>{ settings.trainer=true; settings.strategy=st; settings.marks=false;
      renderStrategyBtn(); },strategie);
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
  ok('Erklaerung nennt beide Richtungen',
     /musste nach (oben|unten|links|rechts) gehen, nicht nach (oben|unten|links|rechts)/.test(mitStrat.text),
     mitStrat.text.slice(0,140));

  const ohneStrat=await lutzZug(false);
  console.log('INFO Lutz-Zug nur mit Trainer: '+JSON.stringify(ohneStrat));
  ok('Trainer nennt die Fehlerklasse auch ohne Strategie-Hinweise',
     /Falsche Richtung/.test(ohneStrat.text), ohneStrat.text.slice(0,140));
  ok('Trainer nennt auch ohne Strategie-Hinweise den besseren Zug',
     /Besser:/.test(ohneStrat.text), ohneStrat.text.slice(0,160));
  ok('Kurzfassung bleibt bei hoechstens 32 Zeichen', ohneStrat.kurz.length<=32, ohneStrat.kurz);
  await page.evaluate(()=>{ settings.strategy=true; renderStrategyBtn(); newGame('english'); });

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

  ok('keine Seitenfehler insgesamt', errors.length===0, errors.join(' | '));
  await browser.close();
  console.log(fails?`\n${fails} FEHLER`:'\nALLE BROWSER-TESTS OK'); process.exitCode=fails?1:0;
})().catch(e=>{ console.error('CRASH',e); process.exit(1); });
