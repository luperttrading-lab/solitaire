const puppeteer=require(process.env.PUPPETEER_PATH||'puppeteer');
const path=require('path'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{ const b=await puppeteer.launch({headless:true,args:['--no-sandbox','--allow-file-access-from-files']});
 for(const reduce of [false,true]){ const p=await b.newPage(); await p.setViewport({width:390,height:844}); await p.emulateMediaFeatures([{name:'prefers-reduced-motion',value:reduce?'reduce':'no-preference'}]);
  await p.goto('file://'+path.resolve(__dirname,'..','index.html'),{waitUntil:'load'}); await sleep(2600);
  const r=await p.evaluate(async()=>{ const l=currentLine(); const m=game.board.moves[l.path[0]]; let t0=performance.now(); await new Promise(res=>animateMove(m,res)); const fwd=performance.now()-t0; applyMove(m,true); render();
    t0=performance.now(); await new Promise(res=>{ undo(); const h=setInterval(()=>{ if(!game.animating){ clearInterval(h); res(); } },10); }); const back=performance.now()-t0; return {fwd:Math.round(fwd),back:Math.round(back),reduce:matchMedia('(prefers-reduced-motion: reduce)').matches}; });
  console.log(JSON.stringify(r)); await p.close(); }
 await b.close(); })();
