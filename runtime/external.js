import RFB from '@novnc/novnc';
const status = document.getElementById('status');
const base = location.pathname.replace(/(?:index|vnc)\.html$/, '').replace(/\/?$/, '/');
const socket = new URL(base+'websockify', location.href); socket.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
let rfb, connected = false, viewOnly = false, actualSize = false, generation = 0;
const releaseKeys=()=>window.dispatchEvent(new Event('blur'));
document.getElementById('screen').addEventListener('focusout',releaseKeys);
function render() {
  document.body.dataset.connected = String(connected);
  status.textContent = connected ? (viewOnly ? 'Connected · View only · Agent can still interact' : 'Connected · Shared browser') : 'Disconnected · Reconnect to resume';
}
function connect() {
  const id = ++generation; rfb?.disconnect(); document.getElementById('screen').replaceChildren();
  connected = false; status.textContent = 'Connecting…';
  rfb = new RFB(document.getElementById('screen'),socket.href,{shared:true});
  rfb.scaleViewport = !actualSize; rfb.resizeSession = false; rfb.viewOnly = viewOnly; rfb.qualityLevel=6; rfb.compressionLevel=2;
  rfb.addEventListener('connect',()=>{if(id===generation){connected=true;render();}});
  rfb.addEventListener('disconnect',()=>{if(id===generation){connected=false;render();}});
}
document.getElementById('reconnect').onclick=connect;
document.getElementById('view-only').onclick=event=>{releaseKeys();viewOnly=!viewOnly;rfb.viewOnly=viewOnly;event.currentTarget.setAttribute('aria-pressed',String(viewOnly));render();};
document.getElementById('scale').onclick=event=>{actualSize=!actualSize;rfb.scaleViewport=!actualSize;event.currentTarget.setAttribute('aria-pressed',String(actualSize));};
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&event.shiftKey){event.preventDefault();event.stopImmediatePropagation();releaseKeys();rfb.blur();document.getElementById('reconnect').focus();}},true);
connect();
