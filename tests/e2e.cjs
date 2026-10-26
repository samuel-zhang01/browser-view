// Runs the packaged extension inside a real, isolated code-server workbench.
const {chromium,_electron}=require('playwright-core');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const http=require('node:http');const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const desktop=process.env.BROWSER_VIEW_VSCODE;
const mode=desktop?'desktop':'code-server';
const artifact=name=>path.join(root,'dist',`${mode}-${name}`);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'browser-view-full-e2e-'));
const env={...process.env,BROWSER_VIEW_STATE:path.join(tmp,'state'),BROWSER_VIEW_WEB_PORT:'6280',BROWSER_VIEW_CDP_PORT:'9422',BROWSER_VIEW_DISPLAY:'100',BROWSER_VIEW_ALLOW_NO_SANDBOX:'1'};
for(const key of ['VSCODE_IPC_HOOK_CLI','CODE_SERVER_PARENT_PID','CODE_SERVER_SESSION_SOCKET','ELECTRON_RUN_AS_NODE','VSCODE_PROXY_URI'])delete env[key];
const receipts=[];let server,driver,shared,fixture,page,desktopApp;
const setViewport=async size=>{
 if(desktop){const win=await desktopApp.browserWindow(page);await win.evaluate((w,s)=>w.setSize(s.width,s.height),size);const actual=await win.evaluate(w=>w.getContentSize());await page.waitForFunction(([w,h])=>innerWidth===w&&innerHeight===h,actual);}
 else await page.setViewportSize(size);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
};
const checks=async(name,fn)=>{const start=Date.now();await fn();receipts.push({name,ms:Date.now()-start});console.log('PASS',name);};
const wait=async(fn,timeout=30000)=>{const until=Date.now()+timeout;while(Date.now()<until){try{const value=await fn();if(value)return value;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Condition timed out');};
(async()=>{
 fs.mkdirSync(path.join(tmp,'user/User'),{recursive:true});fs.mkdirSync(path.join(tmp,'extensions'));fs.mkdirSync(path.join(tmp,'workspace'));
 fs.writeFileSync(path.join(tmp,'user/User/settings.json'),JSON.stringify({'browserView.allowNoSandbox':true,'security.workspace.trust.enabled':false,'workbench.startupEditor':'none','telemetry.telemetryLevel':'off','workbench.secondarySideBar.defaultVisibility':'hidden','remote.autoForwardPorts':false,'update.mode':'none'}));
 const cli=desktop?path.join(path.dirname(desktop),'bin/code'):(process.env.BROWSER_VIEW_CODE_SERVER || '/usr/lib/code-server/bin/code-server');
 await checks('Install distributable VSIX into a clean extension directory',async()=>execFileSync(cli,[...(desktop?['--no-sandbox']:[]),'--user-data-dir',path.join(tmp,'user'),'--extensions-dir',path.join(tmp,'extensions'),'--install-extension',path.join(root,`dist/browser-view-${require('../package.json').version}.vsix`),'--force'],{env,stdio:'pipe'}));
 if(!desktop){
 const log=fs.openSync(path.join(tmp,'code-server.log'),'a');
 server=spawn(cli,['--auth','none','--bind-addr','127.0.0.1:6288','--user-data-dir',path.join(tmp,'user'),'--extensions-dir',path.join(tmp,'extensions'),'--disable-telemetry',path.join(tmp,'workspace')],{env,stdio:['ignore',log,log],detached:true});
 await wait(async()=>{const response=await fetch('http://127.0.0.1:6288/healthz');return response.ok});
 }
 fixture=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><title>Browser View E2E</title><style>body{font:24px system-ui;padding:30px;background:#fafafa}button,input,a{padding:15px;margin:10px;font:inherit}#paint{width:240px;height:120px;background:rgb(220,40,40)}</style><h1>Shared workflow</h1><button id="count">Count</button><output id="total">0</output><input id="text" aria-label="Shared text"><button id="colour">Change colour</button><div id="paint"></div><a href="/next">Next page</a><div style="height:1300px"></div><p id="bottom">Bottom marker</p><script>let n=0;document.querySelector('#count').onclick=()=>document.querySelector('#total').textContent=++n;document.querySelector('#colour').onclick=()=>document.querySelector('#paint').style.background='rgb(40,160,70)';</script></html>`)});
 await new Promise(r=>fixture.listen(6281,'127.0.0.1',r));
 driver=await chromium.launch({executablePath:process.env.BROWSER_VIEW_CHROMIUM||execFileSync('python3',['-c',`import sys;sys.path.insert(0,${JSON.stringify(path.join(root,'runtime'))});import session;print(session.browser_path())`],{env,encoding:'utf8'}).trim(),args:['--no-sandbox']});
 if(desktop){
  desktopApp=await _electron.launch({executablePath:desktop,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--user-data-dir',path.join(tmp,'user'),'--extensions-dir',path.join(tmp,'extensions'),'--skip-welcome','--disable-workspace-trust',path.join(tmp,'workspace')],env,timeout:60000});
  page=await desktopApp.firstWindow(); await setViewport({width:1800,height:1200});
 }else page=await driver.newPage({viewport:{width:1800,height:1200}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 if(!desktop)await page.goto('http://127.0.0.1:6288/?folder='+encodeURIComponent(path.join(tmp,'workspace')));
 await page.locator('.monaco-workbench').waitFor();
 async function command(name){
  await page.locator('.part.titlebar').click({position:{x:100,y:15}});await page.keyboard.press('F1');
  const input=page.locator('.quick-input-widget input');await input.waitFor({state:'visible'});
  await wait(async()=>{await input.fill('>');await input.fill('>'+name);const item=page.locator('.quick-input-list').getByText(name,{exact:true}).first();return await item.isVisible();});
  await page.locator('.quick-input-list').getByText(name,{exact:true}).first().click();
 }
 await checks('Open panel through the real VS Code command palette; start bundled runtime',async()=>{await command('Browser View: Open Shared Browser');});
 let frame=await wait(async()=>{for(const f of page.frames()){if(await f.locator('#screen').count())return f;}return null;});
 await checks('Render desktop over binary extension transport',async()=>{await frame.waitForFunction(()=>document.body.dataset.connected==='true');await frame.waitForFunction(()=>document.querySelector('#screen canvas')?.getContext('2d').getImageData(400,400,1,1).data[0]>100)});
 const state=JSON.parse(fs.readFileSync(path.join(tmp,'state/session.json'),'utf8'));
 assert(state.runtime.startsWith(path.join(tmp,'extensions')),'Runtime must come from packaged extension, not source or skill');
 shared=await chromium.connectOverCDP(state.cdp);const target=shared.contexts()[0].pages()[0];
 await checks('Navigate from panel toolbar to local fixture',async()=>{await frame.getByLabel('Page URL').fill('http://127.0.0.1:6281/');await frame.getByRole('button',{name:'Go',exact:true}).click();await target.waitForURL('http://127.0.0.1:6281/');await target.locator('#count').waitFor();const r=await target.locator('#paint').boundingBox();const top=await target.evaluate(()=>outerHeight-innerHeight);await frame.waitForFunction(({x,y})=>{const c=document.querySelector('#screen canvas');if(!c||c.width!==1440)return false;const p=c.getContext('2d').getImageData(x,y,1,1).data;return p[0]>150&&p[1]<90;},{x:Math.round(r.x+50),y:Math.round(r.y+top+50)});});
 async function point(selector){await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await frame.waitForFunction(()=>document.querySelector('#screen canvas')?.width===1440); const rect=await target.locator(selector).boundingBox();const chrome=await target.evaluate(()=>({top:outerHeight-innerHeight,x:screenX,y:screenY}));const canvas=await frame.locator('#screen canvas').boundingBox();const size=await frame.locator('#screen canvas').evaluate(c=>({w:c.width,h:c.height}));return{x:canvas.x+(rect.x+rect.width/2+chrome.x)*canvas.width/size.w,y:canvas.y+(rect.y+rect.height/2+chrome.top+chrome.y)*canvas.height/size.h};}
 async function click(selector){const p=await point(selector);await page.mouse.click(p.x,p.y,{delay:70});}
 await checks('Panel mouse input reaches the shared page',async()=>{await click('#count');await target.waitForFunction(()=>document.querySelector('#total').textContent==='1');});
 await checks('Panel keyboard input reaches the shared page',async()=>{await click('#text');await page.keyboard.type('hello from VS Code');await target.waitForFunction(()=>document.querySelector('#text').value==='hello from VS Code');});
 await checks('Agent shares the same state and tab',async()=>{await target.locator('#count').click();assert.equal(await target.locator('#total').innerText(),'2');assert.equal(await target.locator('#text').inputValue(),'hello from VS Code');});
 await checks('View-only blocks panel input while agent control remains',async()=>{await frame.getByRole('button',{name:'View only',exact:true}).click();await click('#count');await new Promise(r=>setTimeout(r,150));assert.equal(await target.locator('#total').innerText(),'2');await target.locator('#count').click();assert.equal(await target.locator('#total').innerText(),'3');await frame.getByRole('button',{name:'View only',exact:true}).click();});
 await checks('Reconnect preserves form data and session',async()=>{await frame.getByRole('button',{name:'Reconnect',exact:true}).click();await frame.waitForFunction(()=>document.body.dataset.connected==='true');await click('#count');await target.waitForFunction(()=>document.querySelector('#total').textContent==='4');assert.equal(await target.locator('#text').inputValue(),'hello from VS Code');});
 await checks('Hidden panel pauses; restoring reconnects without losing page state',async()=>{await command('File: New Untitled Text File');await frame.waitForFunction(()=>document.body.dataset.connected!=='true',null,{polling:100});await command('Browser View: Open Shared Browser');await frame.waitForFunction(()=>document.body.dataset.connected==='true');assert.equal(await target.locator('#text').inputValue(),'hello from VS Code');});
 await checks('Close panel and reopen with the same browser and form state',async()=>{
  const pid=JSON.parse(fs.readFileSync(path.join(tmp,'state/session.json'),'utf8')).pid;
  await command('View: Close Editor');
  await wait(()=>frame.isDetached());
  await command('Browser View: Open Shared Browser');
  frame=await wait(async()=>{for(const f of page.frames())if(await f.locator('#screen').count())return f;});
  await frame.waitForFunction(()=>document.body.dataset.connected==='true');
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp,'state/session.json'),'utf8')).pid,pid);
  assert.equal(await target.locator('#text').inputValue(),'hello from VS Code');
 });
 await checks('Actual frame update arrives after agent action',async()=>{const p=await target.locator('#paint').boundingBox();const chrome=await target.evaluate(()=>outerHeight-innerHeight);await target.locator('#colour').click();await frame.waitForFunction(({x,y})=>{const canvas=document.querySelector('#screen canvas');if(!canvas||canvas.width!==1440)return false;const d=canvas.getContext('2d').getImageData(x,y,1,1).data;return d[1]>100&&d[0]<100;},{x:Math.round(p.x+50),y:Math.round(p.y+chrome+50)});});
 await checks('Observe ten agent-to-panel frame updates',async()=>{
 const rect=await target.locator('#paint').boundingBox();const top=await target.evaluate(()=>outerHeight-innerHeight);const latency=[];
 for(let i=0;i<10;i++){
  const rgb=i%2?[30,160,60]:[200,30,40];const start=performance.now();
  await target.locator('#paint').evaluate((el,rgb)=>el.style.background=`rgb(${rgb.join(',')})`,rgb);
  await frame.waitForFunction(({x,y,green})=>{const canvas=document.querySelector('#screen canvas');if(!canvas||canvas.width!==1440)return false;const p=canvas.getContext('2d').getImageData(x,y,1,1).data;return green?p[1]>110&&p[0]<90:p[0]>150&&p[1]<90;},{x:Math.round(rect.x+50),y:Math.round(rect.y+top+50),green:!!(i%2)});
  latency.push(Math.round(performance.now()-start));
 }
 fs.writeFileSync(artifact('frame-latency.json'),JSON.stringify({description:'Agent DOM change to observed panel canvas; includes test polling and local VM load',samplesMs:latency},null,2));
 });
 await checks('Standalone web viewer connects to the same private desktop',async()=>{const external=await driver.newPage();await external.goto(state.viewer);await external.getByText('Connected · Shared browser',{exact:true}).waitFor();await external.close();});
 await checks('Hostile-origin WebSocket is rejected',async()=>{const hostile=await driver.newPage();await hostile.goto('http://127.0.0.1:6281/');const code=await hostile.evaluate(async()=>{const s=new WebSocket('ws://127.0.0.1:6280/websockify');return await new Promise(resolve=>{s.onopen=()=>{s.close();resolve('open')};s.onerror=()=>resolve('rejected');});});await hostile.close();assert.equal(code,'rejected');});
 if(!desktop)await checks('Open in browser uses the real code-server proxy',async()=>{
  const opened=page.waitForEvent('popup');await frame.getByRole('button',{name:'Open in browser',exact:true}).click();
  const external=await opened;assert.match(external.url(),/127\.0\.0\.1:6288\/proxy\/6280/);
  await external.waitForFunction(()=>document.body.dataset.connected==='true');await external.close();
 });
 await checks('Private files and listeners',async()=>{assert.equal(fs.statSync(path.join(tmp,'state')).mode&0o777,0o700);assert.equal(fs.statSync(path.join(tmp,'state/Xauthority')).mode&0o777,0o600);const listeners=execFileSync('ss',['-ltn'],{encoding:'utf8'});for(const port of [6280,9422]){const line=listeners.split('\n').find(l=>l.includes(':'+port+' '));assert(line.includes('127.0.0.1:'+port));}assert(fs.statSync(state.socket).isSocket());const processList=execFileSync('ps',['-eo','pid,args'],{encoding:'utf8'});const vnc=processList.split('\n').find(line=>line.includes('x11vnc ')&&line.includes(state.socket));assert(vnc);const pid=vnc.trim().split(/\s+/)[0];const owned=execFileSync('ss',['-ltnp'],{encoding:'utf8'}).split('\n').filter(line=>line.includes('pid='+pid+','));assert.deepEqual(owned,[],'VNC must not listen on IPv4 or IPv6 TCP');});
 await page.screenshot({path:artifact('workbench.png'),fullPage:true});
 await checks('Fit-to-panel layout and pointer input at multiple screen sizes',async()=>{
  const matrix=[{width:800,height:600},{width:1280,height:720},{width:1920,height:1080},{width:2560,height:1440}];
  for(const size of matrix){
   await setViewport(size);
   await frame.waitForFunction(()=>{const c=document.querySelector('#screen canvas'),s=document.querySelector('#screen');if(!c)return false;const scale=Math.min(s.clientWidth/c.width,s.clientHeight/c.height);return document.documentElement.scrollWidth<=innerWidth&&document.body.scrollWidth<=innerWidth&&Math.abs(c.getBoundingClientRect().width-c.width*scale)<2;});
   await frame.evaluate(()=>new Promise(resolve=>{let last='',stable=0;const check=()=>{const r=document.querySelector('#screen canvas').getBoundingClientRect(),now=[r.x,r.y,r.width,r.height].join(',');stable=now===last?stable+1:0;last=now;if(stable>=4)resolve();else requestAnimationFrame(check);};check();}));
   const before=Number(await target.locator('#total').innerText()); await click('#count');
   await target.waitForFunction(n=>Number(document.querySelector('#total').textContent)===n+1,before);
   const box=await frame.locator('#screen canvas').boundingBox();const screen=await frame.locator('#screen').boundingBox();
   assert(box.width<=screen.width+2&&box.height<=screen.height+2,'Fit mode stays inside the panel');
   await page.screenshot({path:artifact(`${size.width}x${size.height}.png`)});
  }
  await setViewport({width:1800,height:1200});
 });
 await checks('Actual size scrolls without resizing the desktop or other viewers',async()=>{
  await setViewport({width:800,height:600});await frame.getByRole('button',{name:'Actual size',exact:true}).click();
  await frame.waitForFunction(()=>Math.abs(document.querySelector('#screen canvas').getBoundingClientRect().width-1440)<1);
  assert(await frame.locator('#screen > div').evaluate(e=>e.scrollWidth>e.clientWidth));
  assert.equal(await target.evaluate(()=>screen.width),1440);
  await frame.getByRole('button',{name:'Reconnect',exact:true}).click();await frame.waitForFunction(()=>document.body.dataset.connected==='true');
  assert.equal(await frame.getByRole('button',{name:'Actual size',exact:true}).getAttribute('aria-pressed'),'true');
  await frame.getByRole('button',{name:'Actual size',exact:true}).click();await setViewport({width:1800,height:1200});
 });
 await checks('Keyboard escape returns focus to the toolbar',async()=>{
  await click('#text');await page.keyboard.press('Shift+Escape');
  assert.equal(await frame.evaluate(()=>document.activeElement.id),'url');
  const before=await target.locator('#text').inputValue();await click('#text');await page.keyboard.press('End');await page.keyboard.press('a');
  await target.waitForFunction(v=>document.querySelector('#text').value===v+'a',before);
 });
 await checks('Invalid navigation reports a useful error and recovers',async()=>{
  await frame.getByLabel('Page URL').fill('javascript:alert(1)');await frame.getByRole('button',{name:'Go',exact:true}).click();
  await frame.getByText('Use an HTTP(S) URL without embedded credentials.',{exact:true}).waitFor();
  assert(!(await frame.getByRole('button',{name:'Go',exact:true}).isDisabled()));
  await frame.getByRole('button',{name:'Reconnect',exact:true}).click();await frame.waitForFunction(()=>document.body.dataset.connected==='true');
 });
 await checks('Two external viewers at different sizes share one desktop and independent view-only controls',async()=>{
  const small=await driver.newPage({viewport:{width:375,height:667},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const large=await driver.newPage({viewport:{width:1920,height:1080}});
  for(const view of [small,large]){await view.goto(state.viewer);await view.waitForFunction(()=>document.body.dataset.connected==='true');}
  assert(await small.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const view of [small,large])assert.equal(await view.locator('#screen canvas').evaluate(c=>c.width),1440);
  await small.getByRole('button',{name:'View only',exact:true}).click();
  assert.equal(await large.getByRole('button',{name:'View only',exact:true}).getAttribute('aria-pressed'),'false');
  await small.getByRole('button',{name:'Actual size',exact:true}).click();
  assert.equal(await large.locator('#screen canvas').evaluate(c=>c.width),1440);
  await small.screenshot({path:artifact('mobile-actual-size.png')});
  await small.getByRole('button',{name:'Actual size',exact:true}).click();
  await small.screenshot({path:artifact('mobile-fit.png')});
  await large.screenshot({path:artifact('second-screen.png')});
  await small.close();await large.close();
  await frame.waitForFunction(()=>document.body.dataset.connected==='true');
 });
 await checks('Webview reload preserves preferences and establishes a fresh connection',async()=>{
  await frame.getByRole('button',{name:'View only',exact:true}).click();
  await frame.getByRole('button',{name:'Actual size',exact:true}).click();
  const oldOrigin=await frame.evaluate(()=>performance.timeOrigin);
  await command('Developer: Reload Webviews');
  frame=await wait(async()=>{for(const candidate of page.frames()){try{if(await candidate.locator('#screen').count()&&await candidate.evaluate(()=>performance.timeOrigin)!==oldOrigin)return candidate;}catch{}}});
  await frame.waitForFunction(()=>document.body.dataset.connected==='true');
  for(const name of ['View only','Actual size'])assert.equal(await frame.getByRole('button',{name,exact:true}).getAttribute('aria-pressed'),'true');
  await frame.getByRole('button',{name:'View only',exact:true}).click();await frame.getByRole('button',{name:'Actual size',exact:true}).click();
 });
 if(!desktop)await checks('Two editor windows reuse the session and keep independent viewer preferences',async()=>{
  const first=page;const pid=JSON.parse(fs.readFileSync(path.join(tmp,'state/session.json'),'utf8')).pid;
  const second=await driver.newPage({viewport:{width:1280,height:800}});
  try{
   page=second;await second.goto('http://127.0.0.1:6288/?folder='+encodeURIComponent(path.join(tmp,'workspace')));await second.locator('.monaco-workbench').waitFor();
   await command('Browser View: Open Shared Browser');
   const other=await wait(async()=>{for(const f of second.frames())if(await f.locator('#screen').count())return f;});
   await other.waitForFunction(()=>document.body.dataset.connected==='true');
   await other.getByRole('button',{name:'View only',exact:true}).click();
   assert.equal(await frame.getByRole('button',{name:'View only',exact:true}).getAttribute('aria-pressed'),'false');
   assert.equal(JSON.parse(fs.readFileSync(path.join(tmp,'state/session.json'),'utf8')).pid,pid);
   await second.screenshot({path:artifact('second-editor.png')});
  }finally{page=first;await second.close();}
  await frame.waitForFunction(()=>document.body.dataset.connected==='true');
 });
 await checks('Navigate a page link and scroll through panel input',async()=>{await click('a');await target.waitForFunction(()=>location.pathname==='/next');const p=await point('#paint');await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,650);await target.waitForFunction(()=>scrollY>0);});
 await checks('Close Chromium itself and immediately reopen the existing panel',async()=>{
  const oldPid=JSON.parse(fs.readFileSync(path.join(tmp,'state/session.json'),'utf8')).pid;
  const cdp=await shared.newBrowserCDPSession();const disconnected=new Promise(resolve=>shared.once('disconnected',resolve));
  await cdp.send('Browser.close').catch(()=>{});await disconnected;
  await command('Browser View: Open Shared Browser');
  await wait(()=>JSON.parse(fs.readFileSync(path.join(tmp,'state/session.json'),'utf8')).pid!==oldPid);
  await frame.waitForFunction(()=>document.body.dataset.connected==='true'&&document.querySelector('#screen canvas')?.width===1440);
  await wait(async()=>{const r=await fetch('http://127.0.0.1:9422/json/version');return r.ok;});
 });
 await checks('Stop removes session processes and retains profile',async()=>{await command('Browser View: Stop Shared Browser');await wait(()=>!fs.existsSync(path.join(tmp,'state/session.json')));assert(fs.existsSync(path.join(tmp,'state/profile')));});
 await checks('Restart creates a usable new session',async()=>{await command('Browser View: Open Shared Browser');await wait(()=>fs.existsSync(path.join(tmp,'state/session.json')));const f=await wait(async()=>{for(const f of page.frames())if(await f.locator('#screen').count())return f;});await f.waitForFunction(()=>document.body.dataset.connected==='true');});
 fs.writeFileSync(artifact('results.json'),JSON.stringify({passed:receipts,workbenchErrors:errors,tmp},null,2));
})().catch(async error=>{console.error(error);if(page){await page.screenshot({path:artifact('failure.png')}).catch(()=>{});console.error(await page.locator('body').innerText().catch(()=>''));}fs.writeFileSync(artifact('failure.json'),JSON.stringify({error:error.stack,passed:receipts,tmp},null,2));process.exitCode=1;}).finally(async()=>{
 if(desktopApp)await desktopApp.close().catch(()=>{});
 if(shared)await shared.close().catch(()=>{});if(driver)await driver.close().catch(()=>{});
 try{execFileSync('python3',[path.join(root,'runtime/session.py'),'stop'],{env,stdio:'pipe'});}catch{}
 if(server){try{process.kill(-server.pid,'SIGTERM')}catch{}}
 if(fixture)await new Promise(r=>fixture.close(r));
});
