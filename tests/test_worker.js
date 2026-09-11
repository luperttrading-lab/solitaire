const puppeteer=require(process.env.PUPPETEER_PATH||'puppeteer');
const path=require('path'), fs=require('fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(n,c,x)=>{ console.log((c?'OK  ':'FAIL')+' '+n+(x!==undefined?' -> '+x:'')); if(!c) fails++; };
(async()=>{
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--allow-file-access-from-files']});
  const url='file://'+path.resolve(__dirname,'..','index.html');
  async function scenario(name,init,timeoutMs){
    const page=await browser.newPage(); await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    if(init) await page.evaluateOnNewDocument(init);
    await page.goto(url,{waitUntil:'load'}); await sleep(2400);
    // deviate from the book: play 5 arbitrary legal moves
    await page.evaluate(()=>{ for(let k=0;k<5;k++){ const mv=game.board.moves.filter(m=>game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0); applyMove(mv[mv.length-1],true); } render(); });
    const t0=Date.now(); await page.click('#btnHint');
    try{ await page.waitForFunction(()=>!game.searching,{timeout:timeoutMs}); }catch(e){}
    const ms=Date.now()-t0; const st=await page.evaluate(()=>({searching:game.searching,status:statusFullText(),broken:workerBroken,ready:workerReady,line:!!currentLine(),btn:document.getElementById('btnHint').disabled,where:lastSearchWhere}));
    console.log(`INFO ${name}: ${ms} ms | ${JSON.stringify(st)} | errors=${errors.join(';')}`);
    await page.close(); return {ms,st,errors};
  }
  let r=await scenario('Worker normal',null,15000);
  ok('normal: Ergebnis im Hintergrund', !r.st.searching&&r.st.line&&r.st.where==='Hintergrund'&&!r.st.broken);
  r=await scenario('Worker-Konstruktor wirft',()=>{ window.Worker=function(){ throw new Error('blocked'); }; },15000);
  ok('Konstruktor wirft: Rückfall Vordergrund', !r.st.searching&&r.st.line&&r.st.where==='Vordergrund'&&r.st.broken&&!r.st.btn, r.ms+' ms');
  r=await scenario('Worker antwortet nie (stumm)',()=>{ window.Worker=function(){ this.postMessage=function(){}; this.addEventListener=function(){}; this.removeEventListener=function(){}; this.terminate=function(){}; }; },20000);
  ok('stummer Worker: Startprüfung erkennt Ausfall, Vordergrund rechnet', !r.st.searching&&r.st.line&&r.st.where==='Vordergrund'&&r.st.broken&&!r.st.btn, r.ms+' ms');
  r=await scenario('Worker meldet Fehler asynchron',()=>{ window.Worker=function(){ const self=this; this.postMessage=function(){ setTimeout(()=>{ if(self.onerror) self.onerror(new Event('error')); },50); }; this.addEventListener=function(){}; this.removeEventListener=function(){}; this.terminate=function(){}; }; },20000);
  ok('Fehler-Ereignis: Rückfall Vordergrund', !r.st.searching&&r.st.line&&r.st.where==='Vordergrund'&&r.st.broken, r.ms+' ms');
  // sandboxed iframe (opaque origin) like an in-app preview
  const html=fs.readFileSync('index.html','utf8');
  const page=await browser.newPage(); await page.setViewport({width:390,height:844});
  await page.setContent(`<iframe id="f" sandbox="allow-scripts" style="width:390px;height:800px;border:0"></iframe>`);
  await page.evaluate(h=>{ document.getElementById('f').srcdoc=h; },html); await sleep(3500);
  const frame=page.frames().find(f=>f!==page.mainFrame());
  await frame.evaluate(()=>{ for(let k=0;k<5;k++){ const mv=game.board.moves.filter(m=>game.pegAt[m.from]>=0&&game.pegAt[m.over]>=0&&game.pegAt[m.to]<0); applyMove(mv[mv.length-1],true); } render(); });
  const t0=Date.now(); await frame.evaluate(()=>document.getElementById('btnHint').click());
  try{ await frame.waitForFunction(()=>!game.searching,{timeout:20000}); }catch(e){}
  const st=await frame.evaluate(()=>({searching:game.searching,status:statusFullText(),broken:workerBroken,ready:workerReady,line:!!currentLine()}));
  console.log(`INFO sandbox-iframe: ${Date.now()-t0} ms | ${JSON.stringify(st)}`);
  ok('Sandbox-Iframe: Tipp liefert Ergebnis', !st.searching&&st.line);
  await browser.close(); console.log(fails?`\n${fails} FEHLER`:'\nWORKER-TESTS OK'); process.exitCode=fails?1:0;
})().catch(e=>{ console.error('CRASH',e); process.exit(1); });
