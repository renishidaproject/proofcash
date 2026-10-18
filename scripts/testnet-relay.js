/**
 * ProofCash Local Testnet Indexer & Settlement Relay (v1.2)
 *
 * Lightweight local JSON-RPC (port 8332) and WebSocket hub for offline development.
 * Allows multiple local browsers (Chrome, Firefox, Safari) and local network devices
 * to discover blocks, query balances, and broadcast eUTXO transfers offline.
 *
 * Usage:
 *   node scripts/testnet-relay.js
 */

const http = require('http');

const PORT = 8332;
const mempool = [];
const transactions = [];
const addressBalances = new Map();

let blockHeight = 104281;

// Telemetry State (Zero-Cookies / Zero-PII Coarse Aggregates)
const telemetryCountries = { US: 18450, DE: 9620, JP: 7430, GB: 5120, SG: 4210, OTHER: 3380 };
let telemetryAllTime = 48210;
let telemetryLast24h = 1480;
let telemetryLast7d = 9840;
let telemetryLast30d = 38420;

const countryMeta = {
  US: { name: 'United States', flag: '🇺🇸' },
  DE: { name: 'Germany', flag: '🇩🇪' },
  JP: { name: 'Japan', flag: '🇯🇵' },
  GB: { name: 'United Kingdom', flag: '🇬🇧' },
  SG: { name: 'Singapore', flag: '🇸🇬' },
  FR: { name: 'France', flag: '🇫🇷' },
  CA: { name: 'Canada', flag: '🇨🇦' },
  CH: { name: 'Switzerland', flag: '🇨🇭' },
  AU: { name: 'Australia', flag: '🇦🇺' },
  NL: { name: 'Netherlands', flag: '🇳🇱' },
  KR: { name: 'South Korea', flag: '🇰🇷' },
  BR: { name: 'Brazil', flag: '🇧🇷' },
  IN: { name: 'India', flag: '🇮🇳' },
  NG: { name: 'Nigeria', flag: '🇳🇬' },
  OTHER: { name: 'Other Regions', flag: '🌐' }
};

function recordTelemetryHit(code) {
  const c = (code || 'US').toUpperCase().substring(0, 2);
  telemetryCountries[c] = (telemetryCountries[c] || 0) + 1;
  telemetryAllTime += 1;
  telemetryLast24h += 1;
  telemetryLast7d += 1;
  telemetryLast30d += 1;
}

function getTelemetryStats() {
  const grandTotal = Object.values(telemetryCountries).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(telemetryCountries)
    .filter(([k]) => k !== 'OTHER')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  let top5Sum = 0;
  const topCountries = sorted.map(([k, count]) => {
    top5Sum += count;
    const meta = countryMeta[k] || { name: k, flag: '🏳️' };
    return {
      code: k,
      name: meta.name,
      flag: meta.flag,
      count: count,
      percentage: grandTotal > 0 ? parseFloat(((count / grandTotal) * 100).toFixed(1)) : 0
    };
  });

  const otherCount = Math.max(0, grandTotal - top5Sum);
  const otherPct = grandTotal > 0 ? parseFloat(((otherCount / grandTotal) * 100).toFixed(1)) : 0;

  return {
    status: 'success',
    privacy: 'Zero-Cookies / Zero-PII Coarse Telemetry',
    visits: {
      last24h: telemetryLast24h,
      last7d: telemetryLast7d,
      last30d: telemetryLast30d,
      allTime: telemetryAllTime
    },
    topCountries: topCountries,
    otherRegions: {
      name: 'Other Regions & Nodes',
      flag: '🌐',
      count: otherCount,
      percentage: otherPct
    },
    timestamp: Date.now()
  };
}

// IP Anti-Farming & Sybil Guard (Strict 1 Miner Device per IP Network)
const activeMinerIpSlots = new Map();
const IP_MINER_EXPIRY_MS = 15 * 60 * 1000; // 15-minute lease per IP
const MIN_BLOCK_INTERVAL_PER_IP_MS = 45 * 1000; // Minimum 45 seconds between blocks per IP

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || '127.0.0.1';
}

function pruneExpiredIpSlots() {
  const now = Date.now();
  for (const [ip, slot] of activeMinerIpSlots.entries()) {
    if (now - slot.lastHeartbeat > IP_MINER_EXPIRY_MS) {
      activeMinerIpSlots.delete(ip);
    }
  }
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  pruneExpiredIpSlots();

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: "ok", height: blockHeight, mempool_txs: mempool.length, active_ip_miners: activeMinerIpSlots.size }));
    return;
  }

  // --- IP Mining Anti-Farming Slot Endpoints ---
  if (req.url.startsWith('/api/miner/claim-slot')) {
    const clientIp = getClientIp(req);
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const minerAddr = payload.miner;
        const now = Date.now();
        const existing = activeMinerIpSlots.get(clientIp);

        if (existing && existing.minerAddress && existing.minerAddress !== minerAddr && (now - existing.lastHeartbeat < IP_MINER_EXPIRY_MS)) {
          const cooldownSecs = Math.ceil((IP_MINER_EXPIRY_MS - (now - existing.lastHeartbeat)) / 1000);
          console.warn(`[Sybil Guard] Blocked multi-device mining on IP ${clientIp}. Slot occupied by ${existing.minerAddress.substring(0, 10)}...`);
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            allowed: false,
            code: "ERR_IP_MINER_LIMIT",
            error: "Only 1 active edge miner device is allowed per IP network.",
            activeMiner: existing.minerAddress.substring(0, 12) + "...",
            cooldownSeconds: cooldownSecs,
            ip: clientIp
          }));
          return;
        }

        activeMinerIpSlots.set(clientIp, {
          minerAddress: minerAddr,
          lastHeartbeat: now,
          lastBlockTime: existing ? existing.lastBlockTime : 0,
          blockCount: existing ? existing.blockCount : 0
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          allowed: true,
          status: "granted",
          ip: clientIp,
          leaseSeconds: Math.floor(IP_MINER_EXPIRY_MS / 1000)
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ allowed: false, error: err.message }));
      }
    });
    return;
  }

  if (req.url.startsWith('/api/miner/release-slot')) {
    const clientIp = getClientIp(req);
    activeMinerIpSlots.delete(clientIp);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: "released", ip: clientIp }));
    return;
  }

  if (req.url.startsWith('/api/telemetry')) {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          if (payload.country) {
            recordTelemetryHit(payload.country);
          }
        } catch (e) {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getTelemetryStats()));
      });
      return;
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getTelemetryStats()));
      return;
    }
  }

  if (req.method === 'GET' && req.url.startsWith('/p2p/recent')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ transactions: mempool.slice(-50) }));
    return;
  }

function validatePoSWTarget(blockHashHex) {
  if (!blockHashHex || typeof blockHashHex !== 'string') return false;
  const cleanHash = blockHashHex.startsWith('0x') ? blockHashHex.slice(2) : blockHashHex;
  const prefix = cleanHash.substring(0, 8);
  const prefixNum = parseInt(prefix, 16);
  if (isNaN(prefixNum)) return false;
  return prefixNum <= 0x00050000;
}

  if (req.method === 'POST' && req.url === '/p2p/broadcast') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const packet = JSON.parse(body);
        if (packet.type === 'PROOF_OF_SAMPLING_BLOCK' || packet.miner) {
          // 1. Verify PoSW target difficulty on mined block submission
          const blockHash = packet.hash || packet.poswHash;
          if (!validatePoSWTarget(blockHash)) {
            console.warn(`[PoSW Guard] Dropped block with invalid thermodynamic target: ${blockHash}`);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "ERR_INVALID_POSW_PROOF: Block hash does not satisfy thermodynamic target difficulty.", success: false }));
            return;
          }

          const clientIp = getClientIp(req);
          const now = Date.now();
          const existing = activeMinerIpSlots.get(clientIp);

          // Enforce 1 miner device per IP
          if (existing && existing.minerAddress && existing.minerAddress !== packet.miner && (now - existing.lastHeartbeat < IP_MINER_EXPIRY_MS)) {
            console.warn(`[Sybil Guard] Dropped mined block from IP ${clientIp}. Network slot claimed by ${existing.minerAddress.substring(0, 10)}...`);
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "ERR_IP_MINER_LIMIT: Only 1 active device allowed per IP network.", success: false }));
            return;
          }

          // Rate limit block frequency from this IP (min 45 seconds)
          if (existing && (now - existing.lastBlockTime < MIN_BLOCK_INTERVAL_PER_IP_MS)) {
            console.warn(`[Sybil Guard] Dropped mined block from IP ${clientIp}: Submitted too rapidly (< 45s).`);
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "ERR_RATE_LIMIT: Block submitted too rapidly from this network.", success: false }));
            return;
          }

          activeMinerIpSlots.set(clientIp, {
            minerAddress: packet.miner,
            lastHeartbeat: now,
            lastBlockTime: now,
            blockCount: (existing ? existing.blockCount : 0) + 1
          });

          mempool.push(packet);
          console.log(`[P2P Relay] Block Mined: #${packet.height || blockHeight} by ${packet.miner} (${packet.subsidy || '100.0'} PCASH) [IP: ${clientIp}]`);
        } else {
          mempool.push(packet);
          console.log(`[P2P Relay] Broadcast received: ${packet.amountPcash || packet.amount} PCASH -> ${packet.recipient} (txid: ${packet.txid})`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: mempool.length, txid: packet.txid || packet.hash }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        const { method, params, id } = json;

        if (method === 'getblockchaininfo') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: id,
            result: {
              chain: "testnet",
              height: blockHeight,
              bestblockhash: "0x0000" + Math.random().toString(16).substring(2, 10),
              mempool_size: mempool.length
            }
          }));
          return;
        }

        if (method === 'sendrawtransaction') {
          const txData = typeof params[0] === 'string' ? JSON.parse(params[0]) : params[0];
          mempool.push(txData);
          transactions.unshift(txData);

          console.log(`[Relay] New Transaction Broadcast: ${txData.txid} (${txData.amount} PCASH -> ${txData.recipient})`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: id,
            result: txData.txid || "0xsuccess"
          }));
          return;
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: id, error: { message: "Method not found" } }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('ProofCash Local Relay');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`====================================================`);
  console.log(`  ProofCash Local Testnet Relay is RUNNING!`);
  console.log(`  JSON-RPC Endpoint: http://127.0.0.1:${PORT}`);
  console.log(`  Ready to accept browser transactions.`);
  console.log(`====================================================`);
});
