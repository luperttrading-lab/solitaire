const puppeteer=require(process.env.PUPPETEER_PATH||'puppeteer');
const path=require('path'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(n,c,x)=>{ console.log((c?'OK  ':'FAIL')+' '+n+(x!==undefined?' -> '+x:'')); if(!c) fails++; };
// Sollwerte aus index.html: dur = fast==='slow' ? 650 : (fast ? 170 : 230);
// Spulen ruft mit 'slow' und 400 ms Vorlauf auf, also 400+650 = 1050 ms.
// Untere Schranke knapp unter dem Soll (Messjitter), obere Schranke so, dass
// eine geaenderte Konstante auffaellt, ohne dass Systemlast den Test kippt.
const ZUG=[225,330], SPULEN=[1045,1250];
(async()=>{ const b=await puppeteer.launch({headless:true,args:['--no-sandbox','--allow-file-access-from-files']});
 for(const reduce of [false,true]){ const p=await b.newPage(); await p.setViewport({width:390,height:844}); await p.emulateMediaFeatures([{name:'prefers-reduced-motion',value:reduce?'reduce':'no-preference'}]);
  await p.goto('file://'+path.resolve(__dirname,'..','index.html'),{waitUntil:'load'}); await sleep(2600);
  const r=await p.evaluate(async()=>{ const l=currentLine(); const m=game.board.moves[l.path[0]]; let t0=performance.now(); await new Promise(res=>animateMove(m,res)); const fwd=performance.now()-t0; applyMove(m,true); render();
    t0=performance.now(); await new Promise(res=>{ undo(); const h=setInterval(()=>{ if(!game.animating){ clearInterval(h); res(); } },10); }); const back=performance.now()-t0; return {fwd:Math.round(fwd),back:Math.round(back),reduce:matchMedia('(prefers-reduced-motion: reduce)').matches}; });
  const wo=reduce?'mit reduzierter Bewegung':'normal';
  console.log('INFO '+wo+': '+JSON.stringify(r));
  ok('Bewegung angefordert wie eingestellt ('+wo+')',r.reduce===reduce,r.reduce);
  ok('Einzelner Zug dauert '+ZUG[0]+'–'+ZUG[1]+' ms ('+wo+')',r.fwd>=ZUG[0]&&r.fwd<=ZUG[1],r.fwd+' ms');
  ok('Spulen dauert '+SPULEN[0]+'–'+SPULEN[1]+' ms, also Vorlauf plus Sprung ('+wo+')',r.back>=SPULEN[0]&&r.back<=SPULEN[1],r.back+' ms');
  ok('Spulen laeuft langsamer als ein einzelner Zug ('+wo+')',r.back>r.fwd*2,r.back+' ms gegen '+r.fwd+' ms');
  await p.close(); }
 await b.close(); console.log(fails?`\n${fails} FEHLER`:'\nBEWEGUNGS-TESTS OK'); process.exitCode=fails?1:0; })();
