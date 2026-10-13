# ProofCash Edge Relay (Cloudflare Worker)

Zero-knowledge, ultra-fast WebSocket and HTTP pub/sub relay for ProofCash P2P transfers.
Runs on Cloudflare's global edge network (300+ cities). **100% Free** on Cloudflare Workers ($0/month, 100k requests/day).

---

## Method 1: Instant 60-Second Setup via Cloudflare Dashboard (No CLI Required)

1. Log in to your Cloudflare account at [https://dash.cloudflare.com/](https://dash.cloudflare.com/).
2. In the left sidebar, click **Workers & Pages** -> **Overview**.
3. Click the blue **Create Application** button, then select **Create Worker**.
4. Give it a name: `proofcash-relay` and click **Deploy**.
5. Once created, click **Edit code** (or **Quick Edit**).
6. Replace all existing code in the editor by pasting the entire contents of [`worker.js`](worker.js).
7. Click **Deploy** (top right).
8. Copy your worker's live public URL displayed at the top, for example:
   `https://proofcash-relay.<your-subdomain>.workers.dev`

That's it! Your relay is live across 300+ edge data centers.

---

## Method 2: Command Line Setup (Via Wrangler)

If you prefer deploying from your terminal:

```bash
cd cloudflare-relay
npx wrangler login
npx wrangler deploy
```

---

## Verification

Once deployed, visit `https://proofcash-relay.<your-subdomain>.workers.dev/health` in your browser. You will see:

```json
{
  "status": "online",
  "service": "ProofCash Edge Mesh Relay",
  "version": "1.0.0",
  "activeSockets": 0,
  "activeTopics": 0,
  "timestamp": 1728830000000
}
```

In your ProofCash Web Wallet:
Go to **Settings** (`⚙️`) -> **Network & Node Settings** -> paste your worker URL:
`wss://proofcash-relay.<your-subdomain>.workers.dev/ws`
Click **Save**. All transfers will now synchronize across any phone and PC automatically!
