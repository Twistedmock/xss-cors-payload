# XSS Payload Server (CORS + JSON)

Serves the JSON payload with `Access-Control-Allow-Origin: *` so a HackerOne trigger (or any origin) can fetch it over HTTPS.

---

## Option 1: ngrok (local → public HTTPS)

1. **Start the server:**
   ```bash
   cd xss-cors-payload && node server.js
   ```

2. **Expose with ngrok:**
   ```bash
   ngrok http 3000
   ```
   Use the `https://xxxx.ngrok-free.app` URL. Your payload is at the root, e.g.:
   `https://xxxx.ngrok-free.app/`

**Note:** Free ngrok URLs change each time you restart. For a stable URL, use a paid plan or Option 2.

---

## Option 2: Free online hosting (always-on, stable URL)

### Vercel (recommended)

Already configured in this repo. One-time deploy:

```bash
npx vercel
```

(or `npm i -g vercel && vercel`). Use the generated `https://xxx.vercel.app` as the payload URL (root `/`).

### Render

1. Go to [render.com](https://render.com) → New → Web Service.
2. Connect this GitHub repo (or paste the code).
3. Build: `npm install` (or leave default). Start: `node server.js`.
4. Free tier gives `https://your-service.onrender.com` (may spin down after idle; first request can be slow).

### Railway

1. Go to [railway.app](https://railway.app) → New project → Deploy from GitHub (or repo link).
2. Add a service, use this repo; set start command: `node server.js`.
3. Free tier: limited usage per month; you get a stable `https://xxx.up.railway.app` URL.

### Replit

1. [replit.com](https://replit.com) → New Repl → Node.js.
2. Paste `server.js` as main file; in package.json set `"start": "node server.js"` and add a script if needed.
3. Run → use the Replit URL (e.g. `https://xxx.replit.app`). Repl may sleep when idle.

---

## HackerOne trigger usage

- **Payload URL:** your chosen base URL (e.g. `https://xxx.vercel.app/` or `https://xxxx.ngrok-free.app/`).
- The server responds with JSON and `Access-Control-Allow-Origin: *`, so the target page can fetch it and, if it injects the response into the DOM without sanitization, the XSS will trigger.

---

## Restricting CORS (optional)

To allow only a specific program/domain, change in `server.js`:

```js
res.setHeader('Access-Control-Allow-Origin', 'https://target-domain.com');
```

Use `*` only for testing; restrict in real reports if the program allows.
