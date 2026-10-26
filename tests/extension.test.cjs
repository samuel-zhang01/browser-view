const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function host() {
  const commands = new Map(), bridges = [], messages = [];
  let receive;
  class Bridge { constructor() { this.id=0; this.received=[]; this.connections=[]; bridges.push(this); } disconnect() {} connect(id) { this.id=id;this.connections.push(id); } receive(m) {this.received.push(m);} }
  const webview = { postMessage: m => {messages.push(m);return Promise.resolve(true);}, onDidReceiveMessage: callback => receive=callback, asWebviewUri: x=>x, cspSource:'test:' };
  const panel = { webview, visible:true, onDidDispose:()=>{}, onDidChangeViewState:()=>{} };
  const vscode = {window:{createOutputChannel:()=>({appendLine:()=>{}}),createWebviewPanel:()=>panel,showErrorMessage:message=>{throw Error(message);}},workspace:{isTrusted:true,getConfiguration:()=>({get:(_key,fallback)=>fallback})},Uri:{joinPath:(_base,...parts)=>parts.join('/')},ViewColumn:{Beside:2},commands:{registerCommand:(name,handler)=>commands.set(name,handler)}};
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(root,'src/extension.cjs'),'utf8'),{exports,process,Buffer,require:name=>{
    if(name==='vscode')return vscode;
    if(name==='./bridge.cjs')return {Bridge};
    if(name==='node:child_process'){const execFile=()=>{};execFile[require('node:util').promisify.custom]=async()=>({stdout:JSON.stringify({socket:'/tmp/test.sock',viewer:'http://127.0.0.1:6080/',cdp:'http://127.0.0.1:9222'})});return {execFile};}
    if(name.startsWith('./'))return require(path.join(root,'src',name));
    return require(name);
  }});
  exports.activate({subscriptions:[],extension:{packageJSON:{version:'test'}},extensionPath:root,extensionUri:root});
  return {commands,bridges,messages,send:message=>receive(message)};
}
test('messages from a replaced webview cannot disconnect or feed its replacement',async()=>{
  const h=host();await h.commands.get('browserView.open')();
  const first='11111111-1111-1111-1111-111111111111',second='22222222-2222-2222-2222-222222222222';
  await h.send({type:'ready',client:first});await h.send({type:'connect',client:first,id:1});
  await h.send({type:'ready',client:second});await h.send({type:'connect',client:second,id:1});
  await h.send({type:'data',client:first,id:1,data:new ArrayBuffer(1)});
  await h.send({type:'data',client:second,id:1,data:new ArrayBuffer(1)});
  assert.deepEqual(h.bridges[0].connections,[1,1]);assert.equal(h.bridges[0].received.length,1);
  assert.equal(h.bridges[0].received[0].client,second);
  assert.equal(h.messages.filter(m=>m.type==='init').at(-1).client,second);
});
