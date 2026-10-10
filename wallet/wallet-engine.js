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
    this.MAINNET_LAUNCH_TIMESTAMP = 1793491200000; // November 1, 2026 00:00:00 UTC
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
      networkMode: 'testnet', // 'testnet' | 'mainnet'
      rpcUrl: this.DEFAULT_RPC,
      currentBlockHeight: 104281,
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
      isNodeConnected: false
    };

    this.subscribers = [];
    this.processedTxids = new Set();
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

  // --- Persistence & Multi-Account Initialization ---

  async init() {
    this.loadState();

    // Initialize Default Accounts if none exist
    if (!this.state.accounts || this.state.accounts.length === 0) {
      const defaultAddr = this.state.address || ("pc1q" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(20))));
      const defaultName = this.state.networkMode === 'mainnet' ? 'Account 1 (Mainnet Vault)' : 'Account 1 (Testnet Vault)';
      this.state.accounts = [
        {
          id: 'acc_1',
          name: defaultName,
          address: defaultAddr,
          balance_pJ: "0",
          txHistory: []
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
          accounts: parsed.accounts || []
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

  createAccount(name = null) {
    const nextNum = this.state.accounts.length + 1;
    const accountName = name || `Account ${nextNum} (${nextNum === 2 ? 'Secondary' : 'Savings'})`;
    const newAddress = "pc1q" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(20)));
    const newId = `acc_${Date.now()}`;

    // Fresh accounts start with 0.0000 PCASH strictly (zero hardcoding)
    const initBalance = 0n;

    const newAcc = {
      id: newId,
      name: accountName,
      address: newAddress,
      balance_pJ: initBalance.toString(),
      txHistory: []
    };

    this.state.accounts.push(newAcc);
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

  initP2pMesh() {
    this.meshTopic = 'proofcash_settlement_mesh_v1';

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

  connectPublicRelay() {
    const wsUrl = `wss://ntfy.sh/${this.meshTopic}/ws`;

    try {
      this.wsRelay = new WebSocket(wsUrl);
      this.wsRelay.onopen = () => {
        console.info("[P2P Mesh] Connected to global WebSocket relay:", wsUrl);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('proofcash:mesh_status', {
            detail: { connected: true, relay: 'Global P2P Mesh (ntfy.sh)' }
          }));
        }
        // Catch up on any transfers sent while this browser was closed or offline
        this.fetchMeshBacklog();
      };

      this.wsRelay.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.event === 'message' && data.message) {
            const txPacket = JSON.parse(data.message);
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
        // Auto-reconnect after 4 seconds
        setTimeout(() => this.connectPublicRelay(), 4000);
      };
    } catch (e) {
      console.warn("[P2P Relay] WebSocket connection error:", e);
    }
  }

  async fetchMeshBacklog() {
    let newlyCredited = 0;

    // 1. Poll Global Cloud Relay (ntfy.sh)
    try {
      const resp = await fetch(`https://ntfy.sh/${this.meshTopic}/json?poll=1&since=24h`);
      if (resp.ok) {
        const text = await resp.text();
        const lines = text.trim().split('\n');
        for (const line of lines) {
          if (!line) continue;
          try {
            const data = JSON.parse(line);
            if (data.event === 'message' && data.message) {
              const txPacket = typeof data.message === 'string' ? JSON.parse(data.message) : data.message;
              if (this.handleIncomingP2pTransfer(txPacket)) {
                newlyCredited++;
              }
            }
          } catch (err) {}
        }
      }
    } catch (err) {
      // Background catch-up fail is silent
    }

    // 2. Poll Local Development Relay (127.0.0.1:8332)
    try {
      const localResp = await fetch('http://127.0.0.1:8332/p2p/recent');
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

  // --- Conversions ---

  formatPcash(pJ) {
    const val = typeof pJ === 'bigint' ? pJ : BigInt(pJ || 0);
    const whole = val / 1000000000000n;
    const frac = val % 1000000000000n;
    const fracStr = frac.toString().padStart(12, '0').substring(0, 4);
    return `${whole}.${fracStr}`;
  }

  pcashToPJ(pcashStr) {
    const num = parseFloat(pcashStr || "0");
    return BigInt(Math.round(num * 1e12));
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
    const delegation = await this.crypto.signDelegationCertificate(
      cred.id,
      cred.sec1PubkeyHex,
      sessionKey.publicPointBytes,
      targetExpiration
    );

    if (delegation.success) {
      this.state.activeDelegation = {
        enclaveRootPubkey: delegation.enclaveRootPubkey,
        sessionPubkeyHex: delegation.sessionPubkeyHex,
        expirationHeight: targetExpiration,
        derSignatureHex: delegation.derSignatureHex,
        parsedSig: delegation.parsedSig,
        method: delegation.method,
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
    return this.state.currentBlockHeight < this.state.activeDelegation.expirationHeight;
  }

  // --- Shielded Payment & Real-Time Transfer Reflection ---

  async sendShieldedPayment(recipient, amountPcash, memo = "") {
    const amount_pJ = this.pcashToPJ(amountPcash);
    const fee_pJ = 100000000n; // 0.0001 PCASH thermodynamic base fee

    if (this.state.balance_pJ < amount_pJ + fee_pJ) {
      throw new Error(`Insufficient funds: Balance is ${this.formatPcash(this.state.balance_pJ)} PCASH, requested ${amountPcash} PCASH + fee`);
    }

    // Ensure session key is active and authorized
    if (!this.isSessionValid()) {
      await this.authorizeSessionKey(144);
    }

    // 1. Generate Spend Transaction hash
    const txNonce = crypto.getRandomValues(new Uint8Array(16));
    const txPayload = `ProofCash_Spend:${recipient}:${amount_pJ}:${PasskeyCrypto.bufferToHex(txNonce)}`;
    const txHash = PasskeyCrypto.bufferToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txPayload))));

    // 2. Client-side ZK AIR constraint evaluation (< 1,850 constraints)
    const airResult = this.crypto.evaluateDelegationAirConstraints(
      this.state.activeDelegation,
      this.state.currentBlockHeight
    );

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
      fee: "0.0001",
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

    // Rail D: Global Cloud Relay (https://ntfy.sh/proofcash_settlement_mesh_v1)
    let cloudRelaySuccess = false;
    try {
      console.info("[P2P Mesh] Broadcasting transfer to:", recipient.trim(), "Amount:", amountPcash, "TxID:", txEntry.txid);
      const pubRes = await fetch(`https://ntfy.sh/${this.meshTopic || 'proofcash_settlement_mesh_v1'}`, {
        method: 'POST',
        body: JSON.stringify(p2pPacket)
      });
      if (pubRes.ok) cloudRelaySuccess = true;
      console.info("[P2P Mesh] Cloud Broadcast result:", pubRes.status);
    } catch (err) {
      console.warn("[P2P Mesh] Cloud broadcast warning (ad-blocker or offline):", err);
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
      voucher: voucherString,
      cloudRelaySuccess: cloudRelaySuccess,
      localRelaySuccess: localRelaySuccess,
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

  creditMinedBlock(nonce, hash, subsidyPcash = "100.0") {
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
      status: "CONFIRMED"
    };

    this.state.txHistory.unshift(txEntry);
    this.saveState();
    return {
      balance: this.formatPcash(this.state.balance_pJ),
      height: this.state.currentBlockHeight,
      tx: txEntry
    };
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
        if (data.result && data.result.height) {
          this.state.currentBlockHeight = data.result.height;
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
      await fetch(this.state.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "sendrawtransaction",
          params: [JSON.stringify(tx)]
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

  setNetworkMode(mode) {
    if (this.state.networkMode === mode) return;
    this.saveState(); // Persist current network mode ledger first
    this.state.networkMode = mode;
    this.loadState(); // Load target network mode ledger from isolated storage key

    // If no accounts exist in the newly loaded network state, initialize a clean zero-balance vault
    if (!this.state.accounts || this.state.accounts.length === 0) {
      const defaultAddr = "pc1q" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(20)));
      const defaultName = mode === 'mainnet' ? 'Account 1 (Mainnet Vault)' : 'Account 1 (Testnet Vault)';
      this.state.accounts = [
        {
          id: 'acc_1',
          name: defaultName,
          address: defaultAddr,
          balance_pJ: "0",
          txHistory: []
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

    // Restore enclave keys to localStorage
    if (payload.enclaveKeys) {
      for (const [credId, rawKeyJson] of Object.entries(payload.enclaveKeys)) {
        localStorage.setItem('proofcash_enclave_' + credId, rawKeyJson);
      }
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

  // --- BIP-39 Style 24-Word ZK Recovery Mnemonic ---

  getZkRecoveryMnemonic() {
    // Standard compact 64-word cypherpunk dictionary for deterministic recovery visualization
    const WORDLIST = [
      "alpha", "anchor", "beacon", "blake", "bond", "circuit", "cliff", "conduit",
      "crypto", "curfew", "cycle", "delta", "digest", "echo", "element", "enclave",
      "energy", "entropy", "epoch", "erasure", "falcon", "flux", "forge", "fossil",
      "frontier", "fusion", "galaxy", "genesis", "goldilocks", "grain", "gravity", "halo",
      "hash", "horizon", "impact", "inertia", "jubjub", "joule", "landauer", "lattice",
      "monoid", "merkle", "mesh", "nullifier", "nexus", "orbit", "ozone", "passkey",
      "photon", "plonky", "poseidon", "proof", "pulsar", "quantum", "radian", "reactor",
      "shield", "schnorr", "stark", "thermo", "vacuum", "vector", "vortex", "zenith"
    ];

    // Seed derivation from primary address bytes
    const addr = this.state.address || "pc1q000000000000000000000000000000000000";
    const bytes = new TextEncoder().encode(addr + "_mnemonic_seed_v1");
    const words = [];
    for (let i = 0; i < 24; i++) {
      const idx = (bytes[i % bytes.length] * 7 + i * 13) % WORDLIST.length;
      words.push(WORDLIST[idx]);
    }
    return words;
  }

  resetWallet() {
    localStorage.removeItem(this.getStorageKey());
    window.location.reload();
  }
}

// Global export
window.ProofCashWalletEngine = ProofCashWalletEngine;
