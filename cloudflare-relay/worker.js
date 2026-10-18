/**
 * ProofCash Zero-Knowledge Edge Relay Worker v1.0
 * High-performance P2P WebSocket pub/sub router deployed on Cloudflare Workers edge.
 * 
 * Free Tier Compatible (100k requests/day, WebSockets included, $0/month).
 * Zero-Knowledge: Only blind topic hashes and encrypted eUTXO packets are routed.
 */

// In-memory registry of active WebSockets and their subscribed topics
const sockets = new Map(); // ws -> Set of topics
const topicSubscribers = new Map(); // topic -> Set of ws
const messageBacklog = []; // Circular buffer of last 50 transactions for catching up
const MAX_PAYLOAD_BYTES = 65536; // Strict 64 KB DoS / Flood protection cap

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS Headers for browser cross-origin requests
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Upgrade'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route 1: Health & Stats check
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'online',
        service: 'ProofCash Edge Mesh Relay',
        version: '1.0.0',
        activeSockets: sockets.size,
        activeTopics: topicSubscribers.size,
        maxPayloadBytes: MAX_PAYLOAD_BYTES,
        timestamp: Date.now()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Route 2: HTTP POST Broadcast Fallback
    if (url.pathname === '/broadcast' || url.pathname === '/publish') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
      }

      // Check Content-Length header fast-path
      const contentLength = request.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
        return new Response(JSON.stringify({ error: 'Payload Too Large: Maximum allowed packet size is 64 KB' }), {
          status: 413,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        const rawBody = await request.text();
        if (rawBody.length > MAX_PAYLOAD_BYTES) {
          return new Response(JSON.stringify({ error: 'Payload Too Large: Maximum allowed packet size is 64 KB' }), {
            status: 413,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const body = JSON.parse(rawBody);
        const topic = body.topic || 'proofcash_settlement_mesh_v1';
        const packet = body.packet || body;

        broadcastToTopic(topic, packet, null);
        recordBacklog(topic, packet);

        return new Response(JSON.stringify({ 
          success: true, 
          deliveredTo: getSubscriberCount(topic),
          timestamp: Date.now()
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Route 3: Polling Backlog Catch-Up
    if (url.pathname === '/poll' || url.pathname === '/backlog') {
      const topic = url.searchParams.get('topic') || 'proofcash_settlement_mesh_v1';
      const since = parseInt(url.searchParams.get('since') || '0', 10);
      const matches = messageBacklog.filter(m => 
        (m.topic === topic || topic === 'all') && m.timestamp > since
      );
      return new Response(JSON.stringify({ transactions: matches.map(m => m.packet) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Route 4: WebSocket Connection (/ws)
    if (url.pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426, headers: corsHeaders });
      }

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      handleSession(server, url);

      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: corsHeaders
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};

function handleSession(server, url) {
  server.accept();

  const userTopics = new Set();
  const initialTopic = url.searchParams.get('topic') || 'proofcash_settlement_mesh_v1';
  userTopics.add(initialTopic);
  addSubscriber(initialTopic, server);
  sockets.set(server, userTopics);

  // Send greeting
  try {
    server.send(JSON.stringify({
      event: 'connected',
      relay: 'proofcash-edge-relay-cf',
      subscribed: Array.from(userTopics)
    }));
  } catch (e) {}

  server.addEventListener('message', (event) => {
    try {
      // 64 KB Payload Limit Guard
      if (typeof event.data === 'string' && event.data.length > MAX_PAYLOAD_BYTES) {
        try {
          server.send(JSON.stringify({ event: 'error', error: 'Payload Too Large: Maximum allowed message size is 64 KB' }));
        } catch (e) {}
        return;
      }
      if (event.data instanceof ArrayBuffer && event.data.byteLength > MAX_PAYLOAD_BYTES) {
        return;
      }

      const msg = JSON.parse(event.data);

      if (msg.type === 'subscribe' && msg.topic) {
        userTopics.add(msg.topic);
        addSubscriber(msg.topic, server);
        server.send(JSON.stringify({ event: 'subscribed', topic: msg.topic }));
      } else if (msg.type === 'unsubscribe' && msg.topic) {
        userTopics.delete(msg.topic);
        removeSubscriber(msg.topic, server);
      } else if (msg.type === 'publish' || msg.type === 'PCASH_TRANSFER' || msg.txid) {
        const topic = msg.topic || initialTopic;
        const packet = msg.payload || msg;
        broadcastToTopic(topic, packet, server);
        recordBacklog(topic, packet);
      }
    } catch (e) {
      // Non-JSON or malformed message ignored
    }
  });

  const cleanup = () => {
    for (const t of userTopics) {
      removeSubscriber(t, server);
    }
    sockets.delete(server);
  };

  server.addEventListener('close', cleanup);
  server.addEventListener('error', cleanup);
}

function addSubscriber(topic, ws) {
  if (!topicSubscribers.has(topic)) {
    topicSubscribers.set(topic, new Set());
  }
  topicSubscribers.get(topic).add(ws);
}

function removeSubscriber(topic, ws) {
  if (topicSubscribers.has(topic)) {
    const set = topicSubscribers.get(topic);
    set.delete(ws);
    if (set.size === 0) topicSubscribers.delete(topic);
  }
}

function getSubscriberCount(topic) {
  return (topicSubscribers.get(topic) || new Set()).size;
}

function broadcastToTopic(topic, packet, senderWs) {
  const subscribers = topicSubscribers.get(topic);
  if (!subscribers) return;

  const dataStr = JSON.stringify({
    event: 'message',
    topic: topic,
    message: packet,
    timestamp: Date.now()
  });

  for (const ws of subscribers) {
    if (ws !== senderWs) {
      try {
        ws.send(dataStr);
      } catch (e) {
        // Dead socket, will be cleaned up on close
      }
    }
  }
}

function recordBacklog(topic, packet) {
  messageBacklog.push({ topic, packet, timestamp: Date.now() });
  if (messageBacklog.length > 50) {
    messageBacklog.shift();
  }
}
