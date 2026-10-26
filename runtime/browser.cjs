#!/usr/bin/env node
const { chromium } = require('playwright-core');
(async () => {
 const browser = await chromium.connectOverCDP(process.env.BROWSER_VIEW_CDP || 'http://127.0.0.1:9222');
 try {
  const pages = browser.contexts().flatMap(context=>context.pages());
  const page = process.env.BROWSER_VIEW_TAB_URL ? pages.find(page=>page.url()===process.env.BROWSER_VIEW_TAB_URL) : pages.find(page=>!page.url().startsWith('devtools://'));
  if (!page) throw new Error('No browser tab is open.');
  const [action, ...args] = process.argv.slice(2);
  switch(action) {
   case 'tabs': console.log(JSON.stringify(pages.map(page=>page.url()))); break;
   case 'goto': { const url=new URL(args[0]); if(!['http:','https:'].includes(url.protocol)||url.username||url.password) throw Error('Use an HTTP(S) URL without credentials.'); } await page.goto(args[0], { waitUntil: 'domcontentloaded', timeout: 30000 }); await page.bringToFront(); break;
   case 'screenshot': await page.screenshot({path:args[0] || '/tmp/shared-browser.png',fullPage:args[1]==='full'}); break;
   case 'snapshot': console.log(await page.locator('body').ariaSnapshot()); break;
   case 'click': await page.mouse.click(Number(args[0]), Number(args[1])); break;
   case 'button': await page.getByRole('button',{name:args[0],exact:true}).click(); break;
   case 'type': await page.keyboard.insertText(args[0]); break;
   case 'key': await page.keyboard.press(args[0]); break;
   default: throw new Error('Actions: tabs, goto URL, screenshot PATH [full], snapshot, click X Y, button NAME, type TEXT, key KEY');
  }
 } finally {
  // On a CDP-attached browser this disconnects the client; leave its existing context intact.
  await browser.close();
 }
})().catch(error=>{console.error(error.message);process.exitCode=1});
