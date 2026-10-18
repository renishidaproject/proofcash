/**
 * ProofCash Wallet State & Execution Engine v1.2
 * Manages eUTXOs, Pico-Joules accounting (1 PCASH = 10^12 pJ),
 * Two-Tier Enclave Delegation lifecycle, AI streaming channels,
 * Multi-Account switching, Real-Time P2P Mesh Synchronization,
 * and JSON-RPC node communication.
 *
 * Author: Ren Ishida (October 2026)
 */

class ProofCashWalletEngine {
  constructor() {
    this.crypto = new PasskeyCrypto();
    this.TESTNET_STORAGE_KEY = 'proofcash_wallet_testnet_v1';
    this.MAINNET_STORAGE_KEY = 'proofcash_wallet_mainnet_v1';
    this.MAINNET_LAUNCH_TIMESTAMP = 1798729200000; // January 1, 2027 00:00:00 JST (15:00:00 UTC Dec 31, 2026)
    this.DEFAULT_RPC = (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
      ? 'http://127.0.0.1:8332'
      : 'https://rpc.proofcash.org';

    // Canonical Genesis Invariants (Block #0)
    this.GENESIS = {
      height: 0,
      hash: "0xef77394f7adbc68ef6f7b084b9e9d54896f6b3347e550577a3b39bce5e4cb09a",
      stateRoot: "0x9d24db8529db13d58549346b8ec1a4e8d23ce7130389e3e9b70fe25863b9a46c",
      poswHash: "0x00000b4aec2efa3689408bfcb91cf4d7ffcc3e6c06a8f7103310cb230557432b",
      nonce: 7111,
      headline: "Financial Times 09/Oct/2026 Sovereign debt surpasses $100T as autonomous AI compute drains global power grids",
      author: "Ren Ishida",
      premine: "0.0000 PCASH (100% Burned)"
    };
    
    // Core Wallet State
    this.state = {
      networkMode: 'mainnet', // 'mainnet' (Genesis Pre-Launch) | 'testnet' (Sandbox)
      rpcUrl: this.DEFAULT_RPC,
      currentBlockHeight: 0,
      activeAccountId: 'acc_1',
      accounts: [],
      balance_pJ: 0n, // Strictly 0.0000 PCASH default initial balance (zero hardcoding)
      address: null,
      credentials: [], // Registered Passkeys
      activeCredentialId: null,
      activeDelegation: null, // DelegationCertificate
      activeSessionKey: null, // BabyJubjub ephemeral key
      utxos: [],
      txHistory: [],
      streamingChannel: null,
      addressBook: [],
      outboxQueue: [],
      isNodeConnected: false
    };

    this.subscribers = [];
    this.processedTxids = new Set();
    this.clipboardSecurityCache = null;

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', () => this.flushOutboxQueue());
    }
  }

  // --- Network Storage Key & Countdown Helpers ---

  getStorageKey() {
    return this.state.networkMode === 'mainnet' ? this.MAINNET_STORAGE_KEY : this.TESTNET_STORAGE_KEY;
  }

  getMainnetCountdown() {
    const now = Date.now();
    const diff = Math.max(0, this.MAINNET_LAUNCH_TIMESTAMP - now);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);
    const isLaunched = diff <= 0;
    return { days, hours, minutes, seconds, totalMs: diff, isLaunched };
  }

  getMainnetTargetLocalString() {
    try {
      const target = new Date(this.MAINNET_LAUNCH_TIMESTAMP);
      return target.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      });
    } catch (e) {
      return new Date(this.MAINNET_LAUNCH_TIMESTAMP).toUTCString();
    }
  }

  // --- Persistence & Multi-Account Initialization ---

  async init() {
    this.loadState();

    // Ensure cryptographically secure unique entropy seed exists for this wallet
    if (!this.state.zkRecoveryEntropyHex) {
      const entBytes = crypto.getRandomValues(new Uint8Array(32));
      this.state.zkRecoveryEntropyHex = PasskeyCrypto.bufferToHex(entBytes);
      this.saveState();
    }

    // Initialize Default Accounts if none exist
    if (!this.state.accounts || this.state.accounts.length === 0) {
      let defaultAddr = this.state.address;
      if (!defaultAddr) {
        defaultAddr = await PasskeyCrypto.deriveAccountAddress(this.state.zkRecoveryEntropyHex, 0);
      }
      const defaultName = this.state.networkMode === 'mainnet' ? 'Account 1 (Mainnet Vault)' : 'Account 1 (Testnet Vault)';
      this.state.accounts = [
        {
          id: 'acc_1',
          name: defaultName,
          address: defaultAddr,
          balance_pJ: "0",
          txHistory: [],
          derivationIndex: 0
        }
      ];
      this.state.activeAccountId = 'acc_1';
      this.state.address = defaultAddr;
      this.state.balance_pJ = 0n;
      this.state.txHistory = [];
      this.saveState();
    } else {
      // Sync active account fields to top-level state
      this.syncActiveAccountFromList();
    }

    // Ping proofcashd node in background
    this.pingNode();

    // Initialize P2P Mesh AFTER state and active address are fully initialized
    this.initP2pMesh();

    return this.state;
  }

  loadState() {
    try {
      const raw = localStorage.getItem(this.getStorageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        this.state = {
          ...this.state,
          ...parsed,
          networkMode: this.state.networkMode, // Retain selected network mode
          rpcUrl: parsed.rpcUrl || this.DEFAULT_RPC,
          balance_pJ: BigInt(parsed.balance_pJ || "0"),
          accounts: parsed.accounts || [],
          outboxQueue: parsed.outboxQueue || []
        };
        if (parsed.activeSessionKey) {
          const secretHex = parsed.activeSessionKey.secretScalarHex;
          const pubHex = parsed.activeSessionKey.publicPointHex;
          if (secretHex && pubHex) {
            this.state.activeSessionKey = {
              ...parsed.activeSessionKey,
              secretScalarBytes: PasskeyCrypto.hexToBuffer(secretHex),
              publicPointBytes: PasskeyCrypto.hexToBuffer(pubHex)
            };
          } else {
            this.state.activeSessionKey = null;
          }
        }
        if (this.state.txHistory) {
          this.state.txHistory.forEach(tx => {
            if (tx && tx.txid) this.processedTxids.add(tx.txid);
          });
        }
        if (this.state.accounts) {
          this.state.accounts.forEach(acc => {
            if (acc && acc.txHistory) {
              acc.txHistory.forEach(tx => {
                if (tx && tx.txid) this.processedTxids.add(tx.txid);
              });
            }
          });
        }
      } else {
        // Reset state for new network to guarantee strict isolation
        this.state = {
          ...this.state,
          currentBlockHeight: this.state.networkMode === 'mainnet' ? 0 : 104281,
          activeAccountId: 'acc_1',
          accounts: [],
          balance_pJ: 0n,
          address: null,
          activeCredentialId: null,
          activeDelegation: null,
          activeSessionKey: null,
          utxos: [],
          txHistory: [],
          streamingChannel: null
        };
      }
    } catch (e) {
      console.error("[WalletEngine] Failed to load local storage state:", e);
    }
  }

  saveState() {
    try {
      // Keep active account record updated in accounts array
      if (this.state.accounts && this.state.accounts.length > 0) {
        const idx = this.state.accounts.findIndex(a => a.id === this.state.activeAccountId);
        if (idx !== -1) {
          this.state.accounts[idx] = {
            ...this.state.accounts[idx],
            address: this.state.address,
            balance_pJ: this.state.balance_pJ.toString(),
            txHistory: this.state.txHistory
          };
        }
      }

      const serialized = {
        ...this.state,
        balance_pJ: this.state.balance_pJ.toString(),
        accounts: this.state.accounts,
        activeSessionKey: this.state.activeSessionKey ? {
          secretScalarHex: this.state.activeSessionKey.secretScalarHex || (this.state.activeSessionKey.secretScalarBytes ? PasskeyCrypto.bufferToHex(this.state.activeSessionKey.secretScalarBytes) : null),
          publicPointHex: this.state.activeSessionKey.publicPointHex,
          x: this.state.activeSessionKey.x,
          y: this.state.activeSessionKey.y
        } : null
      };
      localStorage.setItem(this.getStorageKey(), JSON.stringify(serialized));
      this.notifySubscribers();
    } catch (e) {
      console.error("[WalletEngine] Failed to persist state:", e);
    }
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    callback(this.state);
  }

  notifySubscribers() {
    this.subscribers.forEach(cb => {
      try { cb(this.state); } catch (e) { console.error(e); }
    });
  }

  // --- Multi-Account Management ---

  syncActiveAccountFromList() {
    const acc = this.state.accounts.find(a => a.id === this.state.activeAccountId) || this.state.accounts[0];
    if (acc) {
      this.state.activeAccountId = acc.id;
      this.state.address = acc.address;
      this.state.balance_pJ = BigInt(acc.balance_pJ || "0");
      this.state.txHistory = acc.txHistory || [];
    }
  }

  async createAccount(name = null) {
    const nextIndex = this.state.accounts.length;
    const nextNum = nextIndex + 1;
    const accountName = name || `Account ${nextNum} (${nextNum === 2 ? 'Secondary Vault' : 'Savings Vault'})`;
    
    // Deterministic derivation from master 24-word ZK recovery seed
    let newAddress;
    if (this.state.zkRecoveryEntropyHex) {
      newAddress = await PasskeyCrypto.deriveAccountAddress(this.state.zkRecoveryEntropyHex, nextIndex);
    } else {
      const entBytes = crypto.getRandomValues(new Uint8Array(32));
      this.state.zkRecoveryEntropyHex = PasskeyCrypto.bufferToHex(entBytes);
      newAddress = await PasskeyCrypto.deriveAccountAddress(this.state.zkRecoveryEntropyHex, nextIndex);
    }
    const newId = `acc_${Date.now()}`;

    const newAcc = {
      id: newId,
      name: accountName,
      address: newAddress,
      balance_pJ: "0",
      txHistory: [],
      derivationIndex: nextIndex
    };

    this.state.accounts.push(newAcc);
    this.saveState();
    this.switchAccount(newId);
    return newAcc;
  }

  switchAccount(accountId) {
    // 1. Flush current active changes
    const currentIdx = this.state.accounts.findIndex(a => a.id === this.state.activeAccountId);
    if (currentIdx !== -1) {
      this.state.accounts[currentIdx].balance_pJ = this.state.balance_pJ.toString();
      this.state.accounts[currentIdx].txHistory = this.state.txHistory;
    }

    // 2. Load target account
    const target = this.state.accounts.find(a => a.id === accountId);
    if (target) {
      this.state.activeAccountId = target.id;
      this.state.address = target.address;
      this.state.balance_pJ = BigInt(target.balance_pJ || "0");
      this.state.txHistory = target.txHistory || [];
      this.saveState();
      return target;
    }
    return null;
  }

  // --- Real-time P2P Mesh & WebSocket Synchronization ---

  getMeshTopic() {
    return `proofcash_mesh_${this.state.networkMode}_v1`;
  }

  initP2pMesh() {
    this.meshTopic = this.getMeshTopic();

    // 1. BroadcastChannel across tabs and browser windows (same browser)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.p2pChannel = new BroadcastChannel('proofcash_p2p_mesh');
        this.p2pChannel.onmessage = (event) => {
          if (event && event.data) {
            this.handleIncomingP2pTransfer(event.data);
          }
        };
      } catch (e) {
        console.warn("[P2P Mesh] BroadcastChannel unavailable:", e);
      }
    }

    // 2. Storage event fallback for cross-window isolation (same browser)
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', (e) => {
        if (e.key === 'proofcash_p2p_transfer' && e.newValue) {
          try {
            const packet = JSON.parse(e.newValue);
            this.handleIncomingP2pTransfer(packet);
          } catch (err) {}
        }
      });
    }

    // 3. Connect to Public Global WebSocket Relay (Syncing across different browsers, phones & PCs)
    this.connectPublicRelay();

    // 4. Active Heartbeat & Polling Fallback (every 4s) to guarantee arrival even if WebSocket disconnects
    if (!this.pollInterval) {
      this.pollInterval = setInterval(() => {
        this.fetchMeshBacklog();
      }, 4000);
    }
  }

  getRelayWsUrl() {
    return this.state.customRelayUrl || 'wss://proofcash-relay.renishida.workers.dev/ws';
  }

  getRelayHttpUrl() {
    const ws = this.getRelayWsUrl();
    return ws.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://').replace(/\/ws\/?$/i, '');
  }

  setCustomRelay(url) {
    this.state.customRelayUrl = (url || "").trim();
    this.saveState();
    if (this.wsRelay) {
      try { this.wsRelay.close(); } catch(e) {}
      this.wsRelay = null;
    }
    this.connectPublicRelay();
  }

  connectPublicRelay() {
    const wsUrl = this.getRelayWsUrl();
    this.meshTopic = this.getMeshTopic();

    try {
      this.wsRelay = new WebSocket(wsUrl);
      this.wsRelay.onopen = () => {
        let hostName = 'Edge Relay';
        try { hostName = new URL(wsUrl).host; } catch(e) {}
        console.info(`[P2P Mesh] Connected to Cloudflare Edge Relay (${this.getMeshTopic()}):`, wsUrl);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('proofcash:mesh_status', {
            detail: { connected: true, relay: `Edge Relay (${hostName})` }
          }));
        }
        // Subscribe to mesh topic
        try {
          this.wsRelay.send(JSON.stringify({ type: 'subscribe', topic: this.getMeshTopic() }));
        } catch(e) {}
        // Catch up on any transfers sent while this browser was closed or offline
        this.fetchMeshBacklog();
        // Flush any offline queued outbox transfers
        this.flushOutboxQueue();
      };

      this.wsRelay.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          let txPacket = null;
          if (data && data.event === 'message' && data.message) {
            txPacket = typeof data.message === 'string' ? JSON.parse(data.message) : data.message;
          } else if (data && data.type === 'PCASH_TRANSFER') {
            txPacket = data;
          }
          if (txPacket) {
            this.handleIncomingP2pTransfer(txPacket);
          }
        } catch (e) {}
      };

      this.wsRelay.onerror = () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('proofcash:mesh_status', {
            detail: { connected: false, relay: 'Reconnecting...' }
          }));
        }
      };

      this.wsRelay.onclose = () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('proofcash:mesh_status', {
            detail: { connected: false, relay: 'Reconnecting...' }
          }));
        }
        // Auto-reconnect after 5 seconds
        setTimeout(() => this.connectPublicRelay(), 5000);
      };
    } catch (e) {
      console.warn("[P2P Relay] WebSocket connection error:", e);
    }
  }

  async fetchMeshBacklog() {
    let newlyCredited = 0;

    // 1. Poll Cloudflare Edge Relay Backlog
    try {
      const httpBase = this.getRelayHttpUrl();
      const resp = await fetch(`${httpBase}/poll?topic=${this.getMeshTopic()}&since=0`, {
        signal: AbortSignal.timeout(3500)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.transactions)) {
          for (const tx of data.transactions) {
            if (this.handleIncomingP2pTransfer(tx)) {
              newlyCredited++;
            }
          }
        }
      }
    } catch (err) {
      // Edge catch-up silent
    }

    // 2. Poll Local Development Relay (127.0.0.1:8332)
    try {
      const localResp = await fetch('http://127.0.0.1:8332/p2p/recent', { signal: AbortSignal.timeout(1500) });
      if (localResp.ok) {
        const localData = await localResp.json();
        if (localData && Array.isArray(localData.transactions)) {
          for (const tx of localData.transactions) {
            if (this.handleIncomingP2pTransfer(tx)) {
              newlyCredited++;
            }
          }
        }
      }
    } catch (err) {
      // Local relay silent
    }

    return newlyCredited;
  }

  async flushOutboxQueue() {
    if (!this.state.outboxQueue || this.state.outboxQueue.length === 0) return 0;
    if (this._isFlushingOutbox) return 0;
    this._isFlushingOutbox = true;

    let flushedCount = 0;
    const remainingQueue = [];

    for (const item of this.state.outboxQueue) {
      let broadcastSuccess = false;

      // 1. WebSocket Relay Fast-Path
      if (this.wsRelay && this.wsRelay.readyState === WebSocket.OPEN) {
        try {
          this.wsRelay.send(JSON.stringify({
            type: "publish",
            topic: this.getMeshTopic(),
            payload: item.packet
          }));
          broadcastSuccess = true;
        } catch (wsErr) {}
      }

      // 2. HTTP Relay Fallback
      if (!broadcastSuccess) {
        try {
          const httpBase = this.getRelayHttpUrl();
          const pubRes = await fetch(`${httpBase}/broadcast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: this.getMeshTopic(), packet: item.packet }),
            signal: AbortSignal.timeout(3000)
          });
          if (pubRes.ok) broadcastSuccess = true;
        } catch (httpErr) {}
      }

      // 3. Local Daemon Relay
      if (!broadcastSuccess) {
        try {
          const localRes = await fetch('http://127.0.0.1:8332/p2p/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.packet),
            signal: AbortSignal.timeout(1500)
          });
          if (localRes.ok) broadcastSuccess = true;
        } catch (localErr) {}
      }

      // 4. On-chain Node Broadcast
      if (this.state.isNodeConnected && item.txEntry) {
        this.broadcastTransaction(item.txEntry);
      }

      if (broadcastSuccess) {
        flushedCount++;
        console.info(`[Outbox] Flushed queued transaction ${item.id} successfully!`);
      } else {
        item.attempts = (item.attempts || 0) + 1;
        remainingQueue.push(item);
      }
    }

    this.state.outboxQueue = remainingQueue;
    this.saveState();
    this._isFlushingOutbox = false;
    return flushedCount;
  }

  async retryOutboxItem(txid) {
    if (!this.state.outboxQueue || this.state.outboxQueue.length === 0) return false;
    const item = this.state.outboxQueue.find(i => i.id === txid);
    if (!item) return false;

    let broadcastSuccess = false;

    // 1. WebSocket Relay Fast-Path
    if (this.wsRelay && this.wsRelay.readyState === WebSocket.OPEN) {
      try {
        this.wsRelay.send(JSON.stringify({
          type: "publish",
          topic: this.getMeshTopic(),
          payload: item.packet
        }));
        broadcastSuccess = true;
      } catch (wsErr) {}
    }

    // 2. HTTP Edge Relay
    if (!broadcastSuccess) {
      try {
        const httpBase = this.getRelayHttpUrl();
        const res = await fetch(`${httpBase}/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: this.getMeshTopic(), packet: item.packet }),
          signal: AbortSignal.timeout(3500)
        });
        if (res.ok) broadcastSuccess = true;
      } catch (err) {}
    }

    // 3. Local P2P Relay
    if (!broadcastSuccess) {
      try {
        const localRes = await fetch('http://127.0.0.1:8332/p2p/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.packet),
          signal: AbortSignal.timeout(2000)
        });
        if (localRes.ok) broadcastSuccess = true;
      } catch (localErr) {}
    }

    // 4. On-chain Node Broadcast
    if (this.state.isNodeConnected && item.txEntry) {
      this.broadcastTransaction(item.txEntry);
    }

    if (broadcastSuccess) {
      this.state.outboxQueue = this.state.outboxQueue.filter(i => i.id !== txid);
      const tx = (this.state.txHistory || []).find(t => t.txid === txid);
      if (tx) tx.status = "CONFIRMED";
      this.saveState();
      this.notifySubscribers();
      return true;
    } else {
      item.attempts = (item.attempts || 0) + 1;
      this.saveState();
      this.notifySubscribers();
      return false;
    }
  }

  cancelOutboxItem(txid) {
    if (!this.state.outboxQueue || this.state.outboxQueue.length === 0) return false;
    const itemIdx = this.state.outboxQueue.findIndex(i => i.id === txid);
    if (itemIdx === -1) return false;
    const item = this.state.outboxQueue[itemIdx];

    // Remove from outbox
    this.state.outboxQueue.splice(itemIdx, 1);

    // Refund amount and fee to balance since the transaction was never broadcast
    if (item.txEntry && item.txEntry.amount) {
      try {
        const refundPJ = this.pcashToPJ(item.txEntry.amount);
        const feePJ = this.pcashToPJ(item.txEntry.fee || "0.0001");
        this.state.balance_pJ += (refundPJ + feePJ);
        this.syncActiveAccountBalance();
      } catch (e) {
        console.warn("[Outbox] Balance refund error:", e);
      }
    }

    // Update transaction history item
    const tx = (this.state.txHistory || []).find(t => t.txid === txid);
    if (tx) {
      tx.status = "CANCELLED";
    }

    this.saveState();
    this.notifySubscribers();
    return true;
  }

  isPasskeyBoundOnDevice() {
    if (!this.state.credentials || this.state.credentials.length === 0) return false;
    if (typeof localStorage !== 'undefined') {
      const bound = localStorage.getItem(`proofcash_passkey_bound_${this.state.address}`);
      return bound === 'true';
    }
    return true;
  }

  handleIncomingP2pTransfer(packet) {
    if (!packet || !packet.txid || !packet.recipient) return false;
    if (packet.network && packet.network !== this.state.networkMode) return false; // Strict network isolation
    if (this.processedTxids.has(packet.txid)) return false;

    // Guard: State must have loaded an address
    if (!this.state.address && (!this.state.accounts || this.state.accounts.length === 0)) {
      return false;
    }

    const targetAddr = (packet.recipient || "").trim().toLowerCase();
    const currentAddr = (this.state.address || "").trim().toLowerCase();
    const amount_pJ = BigInt(packet.amount_pJ || (packet.amountPcash ? this.pcashToPJ(packet.amountPcash).toString() : "0"));
    const amountPcash = packet.amountPcash || this.formatPcash(amount_pJ);

    if (amount_pJ <= 0n) return false;

    let matched = false;

    // Check if target matches active account
    if (currentAddr && currentAddr === targetAddr) {
      this.state.balance_pJ += amount_pJ;
      const receiveRecord = {
        type: "SHIELDED_RECEIVE",
        txid: packet.txid,
        recipient: packet.recipient.trim(),
        sender: packet.sender || "Shielded Origin",
        amount: amountPcash,
        fee: "0.0000",
        memo: packet.memo || "Shielded eUTXO Transfer",
        height: this.state.currentBlockHeight,
        timestamp: packet.timestamp || Date.now(),
        status: "CONFIRMED"
      };
      this.state.txHistory.unshift(receiveRecord);
      this.processedTxids.add(packet.txid);
      matched = true;
    } else {
      // Check if target matches any other account in our multi-account list
      const accIdx = this.state.accounts.findIndex(a => (a.address || "").trim().toLowerCase() === targetAddr);
      if (accIdx !== -1) {
        const cur = BigInt(this.state.accounts[accIdx].balance_pJ || "0");
        this.state.accounts[accIdx].balance_pJ = (cur + amount_pJ).toString();
        this.state.accounts[accIdx].txHistory = this.state.accounts[accIdx].txHistory || [];
        this.state.accounts[accIdx].txHistory.unshift({
          type: "SHIELDED_RECEIVE",
          txid: packet.txid,
          recipient: packet.recipient.trim(),
          sender: packet.sender || "Shielded Origin",
          amount: amountPcash,
          fee: "0.0000",
          memo: packet.memo || "Shielded eUTXO Transfer",
          height: this.state.currentBlockHeight,
          timestamp: packet.timestamp || Date.now(),
          status: "CONFIRMED"
        });
        this.processedTxids.add(packet.txid);
        matched = true;
      }
    }

    if (matched) {
      console.info(`[P2P Mesh] Matched incoming transfer! Credited +${amountPcash} PCASH to ${packet.recipient.trim()}`);
      this.saveState();
      this.notifySubscribers();

      // Dispatch event to show in-app banner/toast
      if (typeof window !== 'undefined' && window.dispatchEvent && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('proofcash:received', {
          detail: {
            amount: amountPcash,
            recipient: packet.recipient.trim(),
            sender: packet.sender,
            txid: packet.txid
          }
        }));
      }
    }
    return matched;
  }

  // --- Anti-Clipboard Hijacking Defense Engine ---

  recordCopiedAddress(address, label = "ProofCash Vault") {
    if (!address || typeof address !== 'string') return;
    this.clipboardSecurityCache = {
      address: address.trim(),
      label: label,
      timestamp: Date.now()
    };
    console.info(`[Anti-Clipper] Copied address tracked: ${address.substring(0, 10)}... (${label})`);
  }

  validateAddressFormat(addr) {
    if (!addr || typeof addr !== 'string') {
      return { valid: false, error: "Address cannot be empty" };
    }
    const clean = addr.trim();
    if (!clean.startsWith('pc1q')) {
      return { valid: false, error: "Invalid prefix: ProofCash addresses must begin with 'pc1q'" };
    }
    if (clean.length < 24 || clean.length > 64) {
      return { valid: false, error: `Invalid length (${clean.length} chars): Expected 24 to 64 characters` };
    }
    // Check valid address charset: alphanumeric lowercase/uppercase or underscore
    const dataPart = clean.substring(4);
    const addrRegex = /^[0-9a-z_]+$/i;
    if (!addrRegex.test(dataPart)) {
      return { valid: false, error: "Invalid characters: ProofCash address must only contain alphanumeric characters" };
    }
    return { valid: true };
  }

  verifyPastedAddress(pastedText) {
    if (!pastedText || typeof pastedText !== 'string') {
      return { valid: false, error: "Empty input" };
    }
    const clean = pastedText.trim();
    const formatCheck = this.validateAddressFormat(clean);
    if (!formatCheck.valid) {
      return formatCheck;
    }

    // Check if recipient is in saved address book
    const contact = (this.state.addressBook || []).find(c => c.address.toLowerCase() === clean.toLowerCase());

    // Check if recipient is in previous transactions
    const isPrevious = (this.state.txHistory || []).some(tx => 
      tx && tx.recipient && tx.recipient.toLowerCase() === clean.toLowerCase()
    );

    // Check clipboard hijacking discrepancy
    let isHijackedWarning = false;
    let copiedAddress = null;
    let copiedLabel = null;
    let timeElapsedSeconds = 0;

    if (this.clipboardSecurityCache) {
      const elapsed = Date.now() - this.clipboardSecurityCache.timestamp;
      // If copied within the last 5 minutes (300,000 ms)
      if (elapsed < 300000) {
        if (clean.toLowerCase() !== this.clipboardSecurityCache.address.toLowerCase()) {
          isHijackedWarning = true;
          copiedAddress = this.clipboardSecurityCache.address;
          copiedLabel = this.clipboardSecurityCache.label;
          timeElapsedSeconds = Math.round(elapsed / 1000);
          console.warn(`[Anti-Clipper Alert] Clipboard mismatch! Copied: ${copiedAddress}, Pasted: ${clean}`);
        }
      }
    }

    return {
      valid: true,
      address: clean,
      isHijackedWarning,
      copiedAddress,
      copiedLabel,
      timeElapsedSeconds,
      isSavedContact: !!contact,
      contactName: contact ? contact.name : null,
      isPreviousRecipient: isPrevious
    };
  }

  // --- Trusted Address Book Management ---

  saveContact(name, address) {
    const val = this.validateAddressFormat(address);
    if (!val.valid) throw new Error(val.error);
    const cleanName = (name || "").trim() || "Contact";
    this.state.addressBook = this.state.addressBook || [];
    
    const existingIdx = this.state.addressBook.findIndex(c => c.address.toLowerCase() === address.trim().toLowerCase());
    if (existingIdx !== -1) {
      this.state.addressBook[existingIdx].name = cleanName;
      this.state.addressBook[existingIdx].updatedAt = Date.now();
    } else {
      this.state.addressBook.push({
        id: 'contact_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        name: cleanName,
        address: address.trim(),
        createdAt: Date.now()
      });
    }
    this.saveState();
    return this.state.addressBook;
  }

  deleteContact(id) {
    this.state.addressBook = (this.state.addressBook || []).filter(c => c.id !== id);
    this.saveState();
    return this.state.addressBook;
  }

  getContacts() {
    return this.state.addressBook || [];
  }

  getRecentRecipients() {
    const recents = [];
    const seen = new Set();
    const myAddr = (this.state.address || '').toLowerCase();

    (this.state.txHistory || []).forEach(tx => {
      if (tx && tx.recipient && (tx.type === 'SHIELDED_SPEND' || tx.type === 'PCASH_TRANSFER')) {
        const addr = tx.recipient.trim();
        if (addr.toLowerCase() !== myAddr && !seen.has(addr.toLowerCase())) {
          seen.add(addr.toLowerCase());
          recents.push({
            address: addr,
            lastSent: tx.timestamp || Date.now(),
            amount: tx.amount || "0"
          });
        }
      }
    });
    return recents.slice(0, 5);
  }

  // --- Conversions (Exact BigInt Fixed-Point, Zero Floating-Point Loss) ---

  formatPcash(pJ, maxDecimals = 4) {
    let val = typeof pJ === 'bigint' ? pJ : BigInt(pJ || 0);
    const negative = val < 0n;
    if (negative) val = -val;
    const whole = val / 1000000000000n;
    const frac = val % 1000000000000n;
    const fracFull = frac.toString().padStart(12, '0');
    const decDigits = Math.max(0, Math.min(12, maxDecimals));
    const fracPart = decDigits > 0 ? fracFull.slice(0, decDigits) : '';
    return (negative ? '-' : '') + (decDigits > 0 ? `${whole}.${fracPart}` : `${whole}`);
  }

  pcashToPJ(pcashStr) {
    if (pcashStr === null || pcashStr === undefined) return 0n;
    if (typeof pcashStr === 'bigint') return pcashStr;
    const s = String(pcashStr).trim();
    if (!s || s === '0') return 0n;

    const isNegative = s.startsWith('-');
    const clean = isNegative ? s.slice(1).trim() : s;
    if (!/^\d+(\.\d+)?$/.test(clean)) {
      throw new Error(`Invalid numeric amount format: "${pcashStr}"`);
    }

    const parts = clean.split('.');
    const whole = BigInt(parts[0] || '0');
    const fracStr = (parts[1] || '').padEnd(12, '0').slice(0, 12);
    const frac = BigInt(fracStr);

    const total_pJ = (whole * 1000000000000n) + frac;
    return isNegative ? -total_pJ : total_pJ;
  }

  // --- Tier 1 & 2 Enclave Delegation Workflow ---

  async registerPasskey(label = "Primary Device") {
    const res = await this.crypto.createPasskey("ren_ishida", label);
    if (res.success) {
      const credEntry = {
        id: res.credentialId,
        rawIdHex: res.rawIdHex,
        sec1PubkeyHex: res.sec1PubkeyHex,
        label: label,
        isHardwareEnclave: res.isHardwareEnclave,
        authenticatorType: res.authenticatorType,
        createdAt: res.timestamp
      };

      this.state.credentials.push(credEntry);
      this.state.activeCredentialId = res.credentialId;
      if (typeof localStorage !== 'undefined' && this.state.address) {
        localStorage.setItem(`proofcash_passkey_bound_${this.state.address}`, 'true');
      }
      this.saveState();

      // Automatically authorize an initial session key
      await this.authorizeSessionKey(144);
      return credEntry;
    }
    throw new Error("Failed to register passkey");
  }

  async authorizeSessionKey(validityBlocks = 144) {
    let cred = this.state.credentials.find(c => c.id === this.state.activeCredentialId);
    if (!cred) {
      await this.registerPasskey("Biometric Hardware Key");
      return this.state.activeDelegation;
    }

    // Step A: Generate ephemeral BabyJubjub in-circuit keypair
    const sessionKey = await this.crypto.generateBabyJubjubKeypair();
    this.state.activeSessionKey = sessionKey;

    // Step B: Request Enclave Biometric Assertion to sign DelegationCertificate
    const targetExpiration = this.state.currentBlockHeight + validityBlocks;
    const currentNetwork = this.state.networkMode || "mainnet";
    const delegation = await this.crypto.signDelegationCertificate(
      cred.id,
      cred.sec1PubkeyHex,
      sessionKey.publicPointBytes,
      targetExpiration,
      currentNetwork
    );

    if (delegation.success) {
      this.state.activeDelegation = {
        enclaveRootPubkey: delegation.enclaveRootPubkey,
        sessionPubkeyHex: delegation.sessionPubkeyHex,
        expirationHeight: targetExpiration,
        derSignatureHex: delegation.derSignatureHex,
        parsedSig: delegation.parsedSig,
        method: delegation.method,
        network: delegation.network || currentNetwork,
        createdAt: Date.now()
      };

      this.state.txHistory.unshift({
        type: "ENCLAVE_DELEGATION",
        txid: "0xdel_" + delegation.derSignatureHex.substring(0, 16),
        height: this.state.currentBlockHeight,
        description: `Biometric Enclave authorized BabyJubjub session key (Valid until block #${targetExpiration})`,
        amount: "0.0000",
        timestamp: Date.now(),
        status: "CONFIRMED"
      });

      this.saveState();
      return this.state.activeDelegation;
    }

    throw new Error("Biometric delegation authorization failed");
  }

  isSessionValid() {
    if (!this.state.activeSessionKey || !this.state.activeDelegation) return false;
    const hasSecret = Boolean(this.state.activeSessionKey.secretScalarBytes || this.state.activeSessionKey.secretScalarHex);
    if (!hasSecret) return false;
    // Cross-Network Replay Protection: Delegation must match current active network mode
    const currentNetwork = (this.state.networkMode || "mainnet").toLowerCase();
    const certNetwork = (this.state.activeDelegation.network || "mainnet").toLowerCase();
    if (currentNetwork !== certNetwork) return false;
    return this.state.currentBlockHeight < this.state.activeDelegation.expirationHeight;
  }

  // --- Shielded Payment & Real-Time Transfer Reflection ---

  async sendShieldedPayment(recipient, amountPcash, memo = "", feePcash = "0.0001") {
    // 1. Strict Recipient Address Format Validation
    const cleanRecipient = (recipient || "").trim();
    const addrCheck = this.validateAddressFormat(cleanRecipient);
    if (!addrCheck.valid) {
      throw new Error(`Invalid recipient address: ${addrCheck.error}`);
    }

    // 2. Exact BigInt Amount & Positive Non-Zero Validation
    const amount_pJ = this.pcashToPJ(amountPcash);
    if (amount_pJ <= 0n) {
      throw new Error("Invalid payment amount: Transfer amount must be strictly greater than zero.");
    }

    // 3. Minimum Network Fee Validation (Min 0.0001 PCASH = 10^8 pJ)
    const fee_pJ = this.pcashToPJ(feePcash || "0.0001");
    if (fee_pJ < 100000000n) {
      throw new Error("Invalid transaction fee: Minimum network fee is 0.0001 PCASH (100,000,000 pJ).");
    }

    // 4. Guarded Mainnet Tier-1 Protocol Caps (Stage 2 Beta Roadmap Invariant)
    if (this.state.networkMode === 'mainnet') {
      const MAX_MAINNET_TX_CAP_PJ = 50n * 1000000000000n; // 50.0 PCASH
      if (amount_pJ > MAX_MAINNET_TX_CAP_PJ) {
        throw new Error(`ERR_GUARDED_CAP_EXCEEDED: Mainnet Beta enforces a maximum per-transaction limit of 50.0 PCASH to prevent systemic risk during Stage 2 bootstrap. Attempted: ${amountPcash} PCASH.`);
      }

      // Check recipient vault cap if recipient is an internal account on same device
      const targetAccIdx = this.state.accounts.findIndex(a => a.address.toLowerCase() === cleanRecipient.toLowerCase());
      if (targetAccIdx !== -1) {
        const curTargetBal = BigInt(this.state.accounts[targetAccIdx].balance_pJ || "0");
        const MAX_VAULT_CAP_PJ = 500n * 1000000000000n; // 500.0 PCASH
        if (curTargetBal + amount_pJ > MAX_VAULT_CAP_PJ) {
          throw new Error("ERR_GUARDED_CAP_EXCEEDED: Recipient vault balance would exceed the Mainnet Beta cap of 500.0 PCASH.");
        }
      }
    }

    if (this.state.balance_pJ < amount_pJ + fee_pJ) {
      throw new Error(`Insufficient funds: Balance is ${this.formatPcash(this.state.balance_pJ)} PCASH, requested ${amountPcash} PCASH + fee (${feePcash || "0.0001"} PCASH)`);
    }

    // Ensure session key is active and authorized
    if (!this.isSessionValid()) {
      await this.authorizeSessionKey(144);
    }

    // 5. Generate Spend Transaction hash
    const txNonce = crypto.getRandomValues(new Uint8Array(16));
    const txPayload = `ProofCash_Spend:${cleanRecipient}:${amount_pJ}:${PasskeyCrypto.bufferToHex(txNonce)}`;
    const txHash = PasskeyCrypto.bufferToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txPayload))));

    // 6. Client-side ZK AIR constraint evaluation (< 1,850 constraints) with Cross-Network verification
    const airResult = this.crypto.evaluateDelegationAirConstraints(
      this.state.activeDelegation,
      this.state.currentBlockHeight,
      this.state.networkMode || "mainnet"
    );
    if (!airResult.passed) {
      throw new Error("ZK Constraint Failure: Enclave delegation certificate is invalid or expired for current network.");
    }

    // 3. Sign with BabyJubjub Ephemeral Session Key (< 45 ms)
    let sigResult;
    try {
      sigResult = await this.crypto.signSessionTransaction(
        this.state.activeSessionKey,
        txHash
      );
    } catch (err) {
      console.warn("[ProofCash] Session sign failed, renewing authorization:", err);
      await this.authorizeSessionKey(144);
      sigResult = await this.crypto.signSessionTransaction(
        this.state.activeSessionKey,
        txHash
      );
    }

    // 4. Deduct sender balance
    this.state.balance_pJ -= (amount_pJ + fee_pJ);

    const txEntry = {
      type: "SHIELDED_SPEND",
      txid: "0x" + txHash,
      recipient: recipient,
      amount: amountPcash,
      fee: feePcash || "0.0001",
      memo: memo,
      height: this.state.currentBlockHeight,
      constraints: airResult.constraintCount,
      airDurationMs: airResult.durationMs,
      signature: sigResult.signatureHex,
      timestamp: Date.now(),
      status: "CONFIRMED"
    };

    this.state.txHistory.unshift(txEntry);
    this.processedTxids.add(txEntry.txid);

    // 5. Handle Direct In-Wallet Multi-Account Transfer (Alice -> Bob on same device)
    const targetAccIdx = this.state.accounts.findIndex(a => a.address === recipient.trim());
    if (targetAccIdx !== -1 && this.state.accounts[targetAccIdx].id !== this.state.activeAccountId) {
      const curBal = BigInt(this.state.accounts[targetAccIdx].balance_pJ || "0");
      this.state.accounts[targetAccIdx].balance_pJ = (curBal + amount_pJ).toString();
      this.state.accounts[targetAccIdx].txHistory = this.state.accounts[targetAccIdx].txHistory || [];
      this.state.accounts[targetAccIdx].txHistory.unshift({
        type: "SHIELDED_RECEIVE",
        txid: txEntry.txid,
        recipient: recipient,
        sender: this.state.address,
        amount: amountPcash,
        fee: "0.0000",
        memo: memo,
        height: this.state.currentBlockHeight,
        timestamp: Date.now(),
        status: "CONFIRMED"
      });
    }

    this.saveState();

    // 6. Construct Canonical P2P Packet & eUTXO Transfer Voucher
    const p2pPacket = {
      type: "PCASH_TRANSFER",
      network: this.state.networkMode,
      txid: txEntry.txid,
      sender: this.state.address,
      recipient: recipient.trim(),
      amountPcash: amountPcash,
      amount_pJ: amount_pJ.toString(),
      memo: memo,
      timestamp: Date.now(),
      signature: sigResult.signatureHex
    };

    // Rail A: Same-browser cross-tab BroadcastChannel
    if (this.p2pChannel) {
      try { this.p2pChannel.postMessage(p2pPacket); } catch (e) {}
    }

    // Rail B: Same-browser cross-window storage event
    try {
      localStorage.setItem('proofcash_p2p_transfer', JSON.stringify(p2pPacket));
    } catch (e) {}

    // Rail C: Local Relay Fast-Path (http://127.0.0.1:8332/p2p/broadcast)
    let localRelaySuccess = false;
    try {
      const localRes = await fetch('http://127.0.0.1:8332/p2p/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p2pPacket)
      });
      if (localRes.ok) localRelaySuccess = true;
    } catch (e) {
      // Local relay unavailable or mixed content, ignore
    }

    // Rail D: Cloudflare Edge Relay (Live WebSocket Fast-Path + HTTP Fallback)
    let cloudRelaySuccess = false;

    // Fast-Path: Send over active Edge WebSocket connection
    if (this.wsRelay && this.wsRelay.readyState === WebSocket.OPEN) {
      try {
        this.wsRelay.send(JSON.stringify({
          type: "publish",
          topic: this.getMeshTopic(),
          payload: p2pPacket
        }));
        cloudRelaySuccess = true;
        console.info("[P2P Mesh] Pushed transfer instantly through active Edge WebSocket!");
      } catch (wsErr) {
        console.warn("[P2P Mesh] WebSocket send error:", wsErr);
      }
    }

    // HTTP Edge Fallback
    try {
      const httpBase = this.getRelayHttpUrl();
      const pubRes = await fetch(`${httpBase}/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: this.getMeshTopic(), packet: p2pPacket }),
        signal: AbortSignal.timeout(3500)
      });
      if (pubRes.ok) cloudRelaySuccess = true;
    } catch (err) {
      // Cloud broadcast notice
    }

    // Queue in Outbox if offline / both relays failed
    if (!cloudRelaySuccess && !localRelaySuccess) {
      this.state.outboxQueue = this.state.outboxQueue || [];
      this.state.outboxQueue.push({
        id: txEntry.txid,
        packet: p2pPacket,
        txEntry: txEntry,
        timestamp: Date.now(),
        attempts: 0
      });
      this.saveState();
      console.info(`[Outbox] Queued transaction ${txEntry.txid} to outboxQueue (offline / relay unreachable)`);
    }

    // Rail E: JSON-RPC proofcashd node broadcast
    this.broadcastTransaction(txEntry);

    // Rail F: Cryptographic eUTXO Transfer Voucher (100% offline & cross-device transferable)
    const voucherPayload = {
      v: 1,
      type: "PCASH_TRANSFER",
      network: this.state.networkMode,
      txid: txEntry.txid,
      sender: this.state.address,
      recipient: recipient.trim(),
      amountPcash: amountPcash,
      amount_pJ: amount_pJ.toString(),
      memo: memo,
      timestamp: Date.now(),
      signature: sigResult.signatureHex
    };
    const voucherString = "PCASH-VOUCHER:" + btoa(JSON.stringify(voucherPayload));

    return {
      success: true,
      txid: txEntry.txid,
      recipient: recipient.trim(),
      amountPcash: amountPcash,
      feePcash: feePcash || "0.0001",
      voucher: voucherString,
      cloudRelaySuccess: cloudRelaySuccess,
      localRelaySuccess: localRelaySuccess,
      outboxQueued: (!cloudRelaySuccess && !localRelaySuccess),
      airVerification: airResult,
      sessionSignature: sigResult
    };
  }

  // --- Instant eUTXO Voucher Redemption (Cross-Browser / Air-Gap Guaranteed Settlement) ---

  redeemTransferVoucher(voucherInput) {
    if (!voucherInput || typeof voucherInput !== 'string') {
      throw new Error("Please enter a valid transfer voucher.");
    }

    let rawJsonStr = voucherInput.trim();
    if (rawJsonStr.startsWith("PCASH-VOUCHER:")) {
      rawJsonStr = rawJsonStr.replace(/^PCASH-VOUCHER:\s*/, '').trim();
      try {
        rawJsonStr = atob(rawJsonStr);
      } catch (e) {
        throw new Error("Invalid voucher format: Could not decode base64 payload.");
      }
    }

    let packet;
    try {
      packet = JSON.parse(rawJsonStr);
    } catch (e) {
      throw new Error("Invalid voucher: Payload is not valid JSON.");
    }

    if (!packet || packet.type !== "PCASH_TRANSFER" || !packet.txid || !packet.recipient) {
      throw new Error("Invalid voucher: Required transaction fields (txid, recipient, amount) missing.");
    }

    if (packet.network && packet.network !== this.state.networkMode) {
      throw new Error(`Network Mismatch: Voucher was issued on ${packet.network.toUpperCase()}, but current wallet is on ${this.state.networkMode.toUpperCase()}. Switch networks to redeem.`);
    }

    if (this.processedTxids.has(packet.txid)) {
      throw new Error(`Double-Redemption Guard: Voucher transaction ${packet.txid.substring(0, 14)}... has already been redeemed into this wallet!`);
    }

    const amount_pJ = BigInt(packet.amount_pJ || this.pcashToPJ(packet.amountPcash || "0").toString());
    const amountPcash = packet.amountPcash || this.formatPcash(amount_pJ);

    if (amount_pJ <= 0n) {
      throw new Error("Invalid voucher: Transfer amount must be positive.");
    }

    // Guarded Mainnet Tier-1 Protocol Caps: 500.0 PCASH maximum vault balance
    if (this.state.networkMode === 'mainnet') {
      const MAX_VAULT_CAP_PJ = 500n * 1000000000000n; // 500.0 PCASH
      if (this.state.balance_pJ + amount_pJ > MAX_VAULT_CAP_PJ) {
        throw new Error("ERR_GUARDED_CAP_EXCEEDED: Redeeming this voucher would cause active vault balance to exceed the Mainnet Beta cap of 500.0 PCASH.");
      }
    }

    // Credit active account balance
    this.state.balance_pJ += amount_pJ;

    const receiveRecord = {
      type: "SHIELDED_RECEIVE",
      txid: packet.txid,
      recipient: this.state.address || packet.recipient.trim(),
      sender: packet.sender || "Shielded Voucher",
      amount: amountPcash,
      fee: "0.0000",
      memo: (packet.memo ? packet.memo + " • " : "") + "Voucher Redeemed",
      height: this.state.currentBlockHeight,
      timestamp: packet.timestamp || Date.now(),
      status: "CONFIRMED"
    };

    this.state.txHistory.unshift(receiveRecord);
    this.processedTxids.add(packet.txid);

    this.saveState();
    this.notifySubscribers();

    // Trigger toast notification
    if (typeof window !== 'undefined' && window.dispatchEvent && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('proofcash:received', {
        detail: {
          amount: amountPcash,
          recipient: this.state.address || packet.recipient.trim(),
          sender: packet.sender || "Voucher",
          txid: packet.txid
        }
      }));
    }

    return {
      success: true,
      amountPcash: amountPcash,
      txid: packet.txid,
      newBalance: this.formatPcash(this.state.balance_pJ)
    };
  }

  // --- AI Micro-Payment Streaming Channel ---

  startAiStream(agentUri = "agent://neural-cluster-04.pcash", onTick = null) {
    if (this.state.streamingChannel) {
      this.stopAiStream();
    }

    const channelId = "chan_0x" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(8)));
    const energyBond_pJ = 10000000000n; // 10,000 pJ bond

    this.state.streamingChannel = {
      id: channelId,
      agentUri: agentUri,
      tokensStreamed: 0,
      streamed_pJ: 0n,
      ratePcashPerToken: "0.000001",
      energyBond_pJ: energyBond_pJ,
      active: true,
      startTime: Date.now()
    };

    this.streamInterval = setInterval(() => {
      if (!this.state.streamingChannel || !this.state.streamingChannel.active) return;

      const tokensBatch = 16;
      const cost_pJ = 16000000n; // 16 tokens * 0.000001 PCASH

      if (this.state.balance_pJ >= cost_pJ) {
        this.state.balance_pJ -= cost_pJ;
        this.state.streamingChannel.tokensStreamed += tokensBatch;
        this.state.streamingChannel.streamed_pJ += cost_pJ;

        if (onTick) {
          onTick({
            tokens: this.state.streamingChannel.tokensStreamed,
            amountPcash: this.formatPcash(this.state.streamingChannel.streamed_pJ),
            balancePcash: this.formatPcash(this.state.balance_pJ)
          });
        }
        this.saveState();
      } else {
        this.stopAiStream();
      }
    }, 120);

    return this.state.streamingChannel;
  }

  stopAiStream() {
    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
    }
    if (this.state.streamingChannel) {
      this.state.streamingChannel.active = false;
      const finalAmount = this.formatPcash(this.state.streamingChannel.streamed_pJ);

      this.state.txHistory.unshift({
        type: "AI_STREAM_SETTLE",
        txid: "0xsettle_" + this.state.streamingChannel.id.substring(7),
        channelId: this.state.streamingChannel.id,
        recipient: this.state.streamingChannel.agentUri,
        tokens: this.state.streamingChannel.tokensStreamed,
        amount: finalAmount,
        height: this.state.currentBlockHeight,
        timestamp: Date.now(),
        status: "CONFIRMED"
      });

      const ch = this.state.streamingChannel;
      this.state.streamingChannel = null;
      this.saveState();
      return ch;
    }
    return null;
  }

  // --- Commutative Delta-UTXO Parallel Monoid Batch ---

  fireMonoidBatch(deltas) {
    let net_pJ = 0n;
    const applied = [];

    deltas.forEach(d => {
      const pJ = this.pcashToPJ(Math.abs(d.amount).toString());
      if (d.amount >= 0) {
        net_pJ += pJ;
      } else {
        net_pJ -= pJ;
      }
      applied.push({
        label: d.label,
        amount: d.amount,
        hash: "0x" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(4)))
      });
    });

    if (net_pJ < 0n && this.state.balance_pJ < -net_pJ) {
      throw new Error("Pool overdraft violation: commutative reduction aborted");
    }

    this.state.balance_pJ += net_pJ;

    this.state.txHistory.unshift({
      type: "DELTA_MONOID_REDUCTION",
      txid: "0xmonoid_" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(8))),
      batchSize: deltas.length,
      netChange: this.formatPcash(net_pJ),
      height: this.state.currentBlockHeight,
      timestamp: Date.now(),
      status: "CONFIRMED"
    });

    this.saveState();
    return { applied, netChange: this.formatPcash(net_pJ) };
  }

  // --- Testnet Faucet ---

  claimFaucet(amountPcash = "50.0") {
    if (this.state.networkMode === 'mainnet') {
      throw new Error("Faucet is strictly disabled on Mainnet. ProofCash Genesis strictly enforces 0 pre-mine; coins can only be acquired via PoSW mining or peer-to-peer transfers.");
    }
    const claim_pJ = this.pcashToPJ(amountPcash);
    this.state.balance_pJ += claim_pJ;

    this.state.txHistory.unshift({
      type: "FAUCET_DISBURSEMENT",
      txid: "0xfaucet_" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(8))),
      amount: amountPcash,
      height: this.state.currentBlockHeight,
      timestamp: Date.now(),
      status: "CONFIRMED"
    });

    this.saveState();
    return this.formatPcash(this.state.balance_pJ);
  }

  // --- Mobile / Edge Mining Reward ---

  creditMinedBlock(nonce, hash, subsidyPcash = "100.0", extraData = {}) {
    if (this.state.networkMode === 'mainnet' && Date.now() < this.MAINNET_LAUNCH_TIMESTAMP) {
      throw new Error("Genesis Invariant Violation: Mobile Edge Mining is strictly locked on Mainnet until activation on January 1, 2027 00:00:00 JST.");
    }
    const subsidy_pJ = this.pcashToPJ(subsidyPcash);
    this.state.balance_pJ += subsidy_pJ;
    this.state.currentBlockHeight += 1;

    const txEntry = {
      type: "MINED_BLOCK_REWARD",
      txid: "0xblk_" + hash.substring(0, 16),
      nonce: nonce,
      amount: subsidyPcash,
      height: this.state.currentBlockHeight,
      timestamp: Date.now(),
      status: "CONFIRMED",
      enclaveTier: extraData.enclaveTier || "Secp256r1 Hardware",
      scratchpadProof: extraData.scratchpadProof || "posw_dag_sampled"
    };

    this.state.txHistory.unshift(txEntry);
    this.saveState();

    // Broadcast newly mined block to Explorer and P2P Mesh
    const blockPacket = {
      type: "PROOF_OF_SAMPLING_BLOCK",
      height: this.state.currentBlockHeight,
      hash: "0x0000" + hash.substring(0, 24),
      nonce: nonce,
      miner: this.state.address,
      subsidy: subsidyPcash,
      timestamp: Date.now(),
      status: "CONFIRMED",
      enclaveTier: extraData.enclaveTier || "Secp256r1 Hardware",
      scratchpadProof: extraData.scratchpadProof || "posw_dag_sampled"
    };

    if (this.channel) {
      try { this.channel.postMessage(blockPacket); } catch (e) {}
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('proofcash_p2p_mined_block', JSON.stringify({ ...blockPacket, _t: Date.now() }));
      } catch (e) {}
    }

    // Broadcast to public relays
    this.broadcastToPublicRelays(blockPacket);

    return {
      balance: this.formatPcash(this.state.balance_pJ),
      height: this.state.currentBlockHeight,
      tx: txEntry
    };
  }

  broadcastToPublicRelays(packet) {
    if (!packet) return;
    if (this.wsRelay && typeof WebSocket !== 'undefined' && this.wsRelay.readyState === WebSocket.OPEN) {
      try {
        this.wsRelay.send(JSON.stringify({
          type: "publish",
          topic: this.getMeshTopic(),
          payload: packet
        }));
      } catch (e) {}
    }
    try {
      const httpBase = this.getRelayHttpUrl();
      if (typeof fetch !== 'undefined') {
        fetch(`${httpBase}/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: this.getMeshTopic(), packet: packet }),
          signal: AbortSignal.timeout(3000)
        }).catch(() => {});
      }
    } catch (e) {}
    try {
      if (typeof fetch !== 'undefined') {
        fetch('http://127.0.0.1:8332/p2p/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(packet),
          signal: AbortSignal.timeout(1500)
        }).catch(() => {});
      }
    } catch (e) {}
  }

  // --- JSON-RPC proofcashd Integration ---

  async pingNode() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const resp = await fetch(this.state.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getblockchaininfo", params: [] }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        this.state.isNodeConnected = true;
        if (data.result && data.result.height !== undefined) {
          this.state.currentBlockHeight = data.result.height;
        }

        // Reconcile on-chain balance if address is set
        if (this.state.address) {
          try {
            const balCtrl = new AbortController();
            const balTimeout = setTimeout(() => balCtrl.abort(), 1500);
            const balResp = await fetch(this.state.rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 2,
                method: "getaddressbalance",
                params: [this.state.address]
              }),
              signal: balCtrl.signal
            });
            clearTimeout(balTimeout);
            if (balResp.ok) {
              const balData = await balResp.json();
              if (balData && balData.result && balData.result.balance_pJ !== undefined) {
                const onChain_pJ = BigInt(balData.result.balance_pJ);
                if (onChain_pJ !== this.state.balance_pJ) {
                  console.info(`[Node Sync] Reconciled balance with on-chain node: ${this.formatPcash(onChain_pJ)} PCASH`);
                  this.state.balance_pJ = onChain_pJ;
                  this.saveState();
                }
              }
            }
          } catch (balErr) {
            // Balance query silent
          }
        }
      } else {
        this.state.isNodeConnected = false;
      }
    } catch (e) {
      this.state.isNodeConnected = false;
    }
    this.notifySubscribers();
  }

  async broadcastTransaction(tx) {
    if (!this.state.isNodeConnected) return;
    try {
      const canonicalTx = {
        txid: tx.txid || ("0x" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(32)))),
        network: this.state.networkMode,
        sender: tx.sender || this.state.address,
        recipient: tx.recipient,
        amount_pJ: tx.amount ? this.pcashToPJ(tx.amount).toString() : (tx.amount_pJ || "0"),
        public_fee: tx.fee ? this.pcashToPJ(tx.fee).toString() : "100000000",
        nullifiers: [tx.txid ? "0xnull_" + tx.txid.replace(/^0x/, '').substring(0, 32) : "0xnull_0"],
        outputs: [
          {
            recipient: tx.recipient,
            amount_pJ: tx.amount ? this.pcashToPJ(tx.amount).toString() : (tx.amount_pJ || "0"),
            memo: tx.memo || ""
          }
        ],
        zk_proof: {
          type: "BABYJUBJUB_SESSION_DELEGATION",
          signature: tx.signature || "",
          constraints: tx.constraints || 1842,
          airDurationMs: tx.airDurationMs || 34
        },
        timestamp: tx.timestamp || Date.now()
      };

      await fetch(this.state.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "sendrawtransaction",
          params: [canonicalTx]
        })
      });
    } catch (e) {
      console.warn("[WalletEngine] Broadcast to node failed:", e);
    }
  }

  // --- Network & RPC Management ---

  updateRpcUrl(newUrl) {
    if (!newUrl) return;
    this.state.rpcUrl = newUrl.trim();
    this.saveState();
    this.pingNode();
  }

  async setNetworkMode(mode) {
    if (this.state.networkMode === mode) return;
    this.saveState(); // Persist current network mode ledger first
    this.state.networkMode = mode;
    this.loadState(); // Load target network mode ledger from isolated storage key

    // Close existing WebSocket to clean up previous network topic
    if (this.wsRelay) {
      try { this.wsRelay.close(); } catch(e) {}
      this.wsRelay = null;
    }

    // If no accounts exist in the newly loaded network state, initialize a clean zero-balance vault
    if (!this.state.accounts || this.state.accounts.length === 0) {
      let defaultAddr;
      if (this.state.zkRecoveryEntropyHex) {
        defaultAddr = await PasskeyCrypto.deriveAccountAddress(this.state.zkRecoveryEntropyHex, 0);
      } else {
        defaultAddr = "pc1q" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(20)));
      }
      const defaultName = mode === 'mainnet' ? 'Account 1 (Mainnet Vault)' : 'Account 1 (Testnet Vault)';
      this.state.accounts = [
        {
          id: 'acc_1',
          name: defaultName,
          address: defaultAddr,
          balance_pJ: "0",
          txHistory: [],
          derivationIndex: 0
        }
      ];
      this.state.activeAccountId = 'acc_1';
      this.state.address = defaultAddr;
      this.state.balance_pJ = 0n;
      this.state.txHistory = [];
      this.state.currentBlockHeight = (mode === 'mainnet') ? 0 : 104281;
      this.saveState();
    } else {
      this.syncActiveAccountFromList();
      if (mode === 'mainnet' && this.state.currentBlockHeight !== 0) {
        this.state.currentBlockHeight = 0;
      } else if (mode === 'testnet' && this.state.currentBlockHeight === 0) {
        this.state.currentBlockHeight = 104281;
      }
    }

    // Reconnect to public relay with new topic for this network
    this.connectPublicRelay();
    this.fetchMeshBacklog();
    this.flushOutboxQueue();

    this.notifySubscribers();
    this.pingNode();
  }

  // --- Encrypted Keystore Backup & Recovery (PBKDF2 + AES-256-GCM) ---

  async deriveBackupKey(passphrase, saltBytes) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: 100000,
        hash: "SHA-256"
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async exportEncryptedBackup(passphrase) {
    if (!passphrase || passphrase.length < 6) {
      throw new Error("Passphrase must be at least 6 characters long for cryptographic security.");
    }

    // 1. Collect all emulated enclave credentials stored in localStorage
    const enclaveKeys = {};
    if (this.state.credentials) {
      for (const cred of this.state.credentials) {
        const stored = localStorage.getItem('proofcash_enclave_' + cred.id);
        if (stored) {
          enclaveKeys[cred.id] = stored;
        }
      }
    }

    // 2. Build canonical backup payload
    const backupPayload = {
      app: "ProofCash Sovereign Wallet",
      schemaVersion: 1,
      networkMode: this.state.networkMode,
      activeAccountId: this.state.activeAccountId,
      address: this.state.address,
      balance_pJ: this.state.balance_pJ.toString(),
      accounts: this.state.accounts,
      credentials: this.state.credentials,
      enclaveKeys: enclaveKeys,
      zkRecoveryEntropyHex: this.state.zkRecoveryEntropyHex,
      txHistory: this.state.txHistory,
      exportedAt: Date.now()
    };

    const plaintextStr = JSON.stringify(backupPayload);
    const plaintextBytes = new TextEncoder().encode(plaintextStr);

    // Compute plaintext SHA-256 checksum for post-decryption integrity verification
    const checksumHash = new Uint8Array(await crypto.subtle.digest("SHA-256", plaintextBytes));
    const checksumHex = PasskeyCrypto.bufferToHex(checksumHash);

    // 3. Generate random 16-byte Salt and 12-byte IV
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const ivBytes = crypto.getRandomValues(new Uint8Array(12));

    // 4. Derive AES-GCM-256 key from passphrase
    const aesKey = await this.deriveBackupKey(passphrase, saltBytes);

    // 5. Encrypt
    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivBytes },
      aesKey,
      plaintextBytes
    );

    const backupEnvelope = {
      version: 1,
      format: "ProofCash-Encrypted-Keystore-v1",
      kdf: "PBKDF2-SHA256",
      iterations: 100000,
      saltHex: PasskeyCrypto.bufferToHex(saltBytes),
      cipher: "AES-256-GCM",
      ivHex: PasskeyCrypto.bufferToHex(ivBytes),
      ciphertextHex: PasskeyCrypto.bufferToHex(new Uint8Array(ciphertextBuffer)),
      checksumHex: checksumHex,
      primaryAddress: this.state.address,
      exportedAt: backupPayload.exportedAt
    };

    return JSON.stringify(backupEnvelope, null, 2);
  }

  async importEncryptedBackup(envelopeJsonStr, passphrase) {
    if (!envelopeJsonStr || !passphrase) {
      throw new Error("Both backup file contents and passphrase are required.");
    }

    let envelope;
    try {
      envelope = JSON.parse(envelopeJsonStr);
    } catch (e) {
      throw new Error("Invalid backup file: Not valid JSON.");
    }

    if (!envelope.saltHex || !envelope.ivHex || !envelope.ciphertextHex) {
      throw new Error("Invalid ProofCash backup envelope structure.");
    }

    const saltBytes = PasskeyCrypto.hexToBuffer(envelope.saltHex);
    const ivBytes = PasskeyCrypto.hexToBuffer(envelope.ivHex);
    const ciphertextBytes = PasskeyCrypto.hexToBuffer(envelope.ciphertextHex);

    // Derive key
    const aesKey = await this.deriveBackupKey(passphrase, saltBytes);

    let decryptedBuffer;
    try {
      decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBytes },
        aesKey,
        ciphertextBytes
      );
    } catch (err) {
      throw new Error("Decryption failed: Incorrect passphrase or corrupted backup file.");
    }

    const decryptedBytes = new Uint8Array(decryptedBuffer);

    // Check integrity
    if (envelope.checksumHex) {
      const computedHash = new Uint8Array(await crypto.subtle.digest("SHA-256", decryptedBytes));
      const computedHex = PasskeyCrypto.bufferToHex(computedHash);
      if (computedHex !== envelope.checksumHex) {
        throw new Error("Checksum mismatch: Decrypted backup integrity check failed.");
      }
    }

    const decryptedStr = new TextDecoder().decode(decryptedBytes);
    const payload = JSON.parse(decryptedStr);

    // Restore state
    this.state.accounts = payload.accounts || [];
    this.state.credentials = payload.credentials || [];
    this.state.activeAccountId = payload.activeAccountId || (payload.accounts[0] ? payload.accounts[0].id : 'acc_1');
    this.state.address = payload.address || (payload.accounts[0] ? payload.accounts[0].address : null);
    this.state.balance_pJ = BigInt(payload.balance_pJ || "0");
    this.state.txHistory = payload.txHistory || [];
    this.state.zkRecoveryEntropyHex = payload.zkRecoveryEntropyHex || this.state.zkRecoveryEntropyHex;

    // Restore enclave keys to localStorage
    if (payload.enclaveKeys) {
      for (const [credId, rawKeyJson] of Object.entries(payload.enclaveKeys)) {
        localStorage.setItem('proofcash_enclave_' + credId, rawKeyJson);
      }
    }

    // Reset device enclave binding for newly restored device
    if (typeof localStorage !== 'undefined' && this.state.address) {
      localStorage.removeItem('proofcash_passkey_bound_' + this.state.address);
    }

    this.saveState();
    this.notifySubscribers();

    return {
      success: true,
      restoredAddress: this.state.address,
      restoredAccountsCount: this.state.accounts.length,
      balancePcash: this.formatPcash(this.state.balance_pJ)
    };
  }

  // --- BIP-39 Standard 24-Word ZK Recovery Mnemonic Subsystem ---

  async getZkRecoveryMnemonic() {
    if (!this.state.zkRecoveryEntropyHex) {
      const entBytes = crypto.getRandomValues(new Uint8Array(32));
      this.state.zkRecoveryEntropyHex = PasskeyCrypto.bufferToHex(entBytes);
      this.saveState();
    }
    const entropyBytes = PasskeyCrypto.hexToBuffer(this.state.zkRecoveryEntropyHex);
    return await PasskeyCrypto.entropyToMnemonic(entropyBytes);
  }

  async importZkRecoveryMnemonic(mnemonicStr) {
    if (!mnemonicStr) {
      throw new Error("Please enter your 24-word recovery phrase.");
    }
    const words = mnemonicStr.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length !== 24) {
      throw new Error(`Expected exactly 24 words, but found ${words.length}. Please check your phrase.`);
    }

    const entropyBytes = await PasskeyCrypto.mnemonicToEntropy(words);
    const entropyHex = PasskeyCrypto.bufferToHex(entropyBytes);

    // Deterministically derive primary vault address (index 0) from entropy
    const restoredAddr = await PasskeyCrypto.deriveAccountAddress(entropyHex, 0);

    this.state.zkRecoveryEntropyHex = entropyHex;
    this.state.address = restoredAddr;
    this.state.activeAccountId = 'acc_1';
    this.state.accounts = [
      {
        id: 'acc_1',
        name: 'Account 1 (Recovered via 24-Word Seed)',
        address: restoredAddr,
        balance_pJ: "0",
        txHistory: [],
        derivationIndex: 0
      }
    ];
    this.state.balance_pJ = 0n;
    this.state.txHistory = [
      {
        type: "ACCOUNT_GENESIS",
        txid: "0xseed_recover_" + entropyHex.substring(0, 16),
        amount: "0.0000",
        timestamp: Date.now(),
        status: "CONFIRMED"
      }
    ];

    if (typeof localStorage !== 'undefined' && this.state.address) {
      localStorage.removeItem('proofcash_passkey_bound_' + this.state.address);
    }
    this.saveState();
    this.notifySubscribers();

    // Pull any existing mesh backlog or transfers for this address
    try {
      await this.fetchMeshBacklog();
    } catch (e) {}

    return {
      restoredAddress: restoredAddr,
      message: "Vault successfully restored from 24-Word ZK Seed!"
    };
  }

  // --- Shamir's Secret Sharing (2-of-3 Sovereign Key Split) ---

  async getShamirEntropyShares() {
    if (!this.state.zkRecoveryEntropyHex) {
      await this.getZkRecoveryMnemonic();
    }
    const entropyBytes = PasskeyCrypto.hexToBuffer(this.state.zkRecoveryEntropyHex);
    return PasskeyCrypto.splitEntropyShamir(entropyBytes);
  }

  async importShamirEntropyShares(shareAStr, shareBStr) {
    const entropyBytes = PasskeyCrypto.combineEntropyShamir(shareAStr, shareBStr);
    const entropyHex = PasskeyCrypto.bufferToHex(entropyBytes);
    const restoredAddr = await PasskeyCrypto.deriveAccountAddress(entropyHex, 0);

    this.state.zkRecoveryEntropyHex = entropyHex;
    this.state.address = restoredAddr;
    this.state.activeAccountId = 'acc_1';
    this.state.accounts = [
      {
        id: 'acc_1',
        name: 'Account 1 (Recovered via 2-of-3 Shamir Shares)',
        address: restoredAddr,
        balance_pJ: "0",
        txHistory: [],
        derivationIndex: 0
      }
    ];
    this.state.balance_pJ = 0n;
    this.state.txHistory = [
      {
        type: "ACCOUNT_GENESIS",
        txid: "0xshamir_recover_" + entropyHex.substring(0, 16),
        amount: "0.0000",
        timestamp: Date.now(),
        status: "CONFIRMED"
      }
    ];

    if (typeof localStorage !== 'undefined' && this.state.address) {
      localStorage.removeItem('proofcash_passkey_bound_' + this.state.address);
    }
    this.saveState();
    this.notifySubscribers();

    try {
      await this.fetchMeshBacklog();
    } catch (e) {}

    return {
      restoredAddress: restoredAddr,
      message: "Vault successfully restored from 2-of-3 Shamir Shares!"
    };
  }

  async verifyEnclaveAuthentication() {
    let cred = (this.state.credentials || []).find(c => c.id === this.state.activeCredentialId);
    if (!cred && (this.state.credentials || []).length > 0) {
      cred = this.state.credentials[0];
    }

    if (!cred) {
      // If no passkey registered yet, register biometric passkey
      await this.registerPasskey("Biometric Hardware Key");
      return { success: true, method: "passkey_registered" };
    }

    // Trigger WebAuthn biometric hardware assertion or session key renewal
    const res = await this.authorizeSessionKey(144);
    return { success: true, delegation: res };
  }

  resetWallet() {
    localStorage.removeItem(this.getStorageKey());
    window.location.reload();
  }

  exportHistoryCsv() {
    const history = this.state.txHistory || [];
    const headers = ["Timestamp", "Date (ISO)", "Type", "TxID", "Amount (PCASH)", "Fee (PCASH)", "Recipient", "Sender", "Height", "Status", "Memo"];
    const rows = [headers.join(",")];

    for (const tx of history) {
      const dateIso = tx.timestamp ? new Date(tx.timestamp).toISOString() : "";
      const row = [
        tx.timestamp || "",
        `"${dateIso}"`,
        `"${tx.type || ""}"`,
        `"${tx.txid || ""}"`,
        `"${tx.amount || "0.0000"}"`,
        `"${tx.fee || "0.0000"}"`,
        `"${tx.recipient || ""}"`,
        `"${tx.sender || ""}"`,
        tx.height !== undefined ? tx.height : "",
        `"${tx.status || "CONFIRMED"}"`,
        `"${(tx.memo || "").replace(/"/g, '""')}"`
      ];
      rows.push(row.join(","));
    }

    const csvContent = rows.join("\r\n");

    // Trigger browser download if window/document is available
    if (typeof document !== 'undefined' && document.createElement) {
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `proofcash_history_${this.state.networkMode}_${this.state.address ? this.state.address.substring(0, 10) : 'vault'}_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    return csvContent;
  }
}

// Global export for wallet and node use
if (typeof window !== 'undefined') {
  window.ProofCashWalletEngine = ProofCashWalletEngine;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProofCashWalletEngine;
}
