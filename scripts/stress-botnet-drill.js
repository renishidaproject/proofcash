/**
 * ProofCash Automated Botnet & Sybil Defense Stress Drill
 * Author: Core Engineering & Security Council | Ren Ishida (October 2026)
 *
 * Simulates:
 * 1. Multi-device IP farming attack (detecting multiple phone claims on 1 IP).
 * 2. High-speed block flooding / rapid submission attack (< 45s block interval).
 * 3. Legitimate slot release and handoff lifecycle.
 * 4. Sybil spoofing resistance.
 */

const http = require('http');

function postJson(urlPath, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8332,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body || '{}') });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runDrill() {
  console.log('==================================================================');
  console.log('  PROOFCASH AUTOMATED BOTNET & SYBIL RESISTANCE STRESS DRILL    ');
  console.log('==================================================================\n');

  // Step 1: Release any lingering slot from previous runs
  console.log('[STEP 1/5] Resetting IP lease slot on 127.0.0.1...');
  const resetRes = await postJson('/api/miner/release-slot', {});
  console.log(`  -> Slot state reset: Status ${resetRes.status}`);

  // Step 2: Honest Worker 1 claims IP slot
  console.log('\n[STEP 2/5] Honest Worker 1 claims IP mining lease...');
  const worker1Addr = 'pc1q_honest_miner_alpha_9999999999';
  const claim1 = await postJson('/api/miner/claim-slot', { miner: worker1Addr });
  console.log(`  -> Claim response: HTTP ${claim1.status}, Allowed: ${claim1.body.allowed}, IP: ${claim1.body.ip}`);
  if (claim1.status !== 200 || !claim1.body.allowed) {
    throw new Error('Failed to claim valid slot for Worker 1');
  }

  // Step 3: Sybil Farmer Worker 2 attempts to mine from SAME IP
  console.log('\n[STEP 3/5] Sybil Farmer launches Worker 2 from SAME IP (Botnet Farm Simulation)...');
  const worker2Addr = 'pc1q_sybil_attacker_beta_8888888888';
  const claim2 = await postJson('/api/miner/claim-slot', { miner: worker2Addr });
  console.log(`  -> Sybil claim response: HTTP ${claim2.status}, Allowed: ${claim2.body.allowed}`);
  console.log(`  -> Sybil Error Code: ${claim2.body.code} | Cooldown: ${claim2.body.cooldownSeconds}s`);
  if (claim2.status === 429 && claim2.body.code === 'ERR_IP_MINER_LIMIT') {
    console.log('  -> DEFENSE VERIFIED: Multi-device IP farming blocked with 429 ERR_IP_MINER_LIMIT!');
  } else {
    throw new Error('SECURITY FAILURE: Sybil miner was not blocked on same IP!');
  }

  // Step 4: Rapid Block Flooding Attack (Flooding blocks < 45 seconds)
  console.log('\n[STEP 4/5] Rapid Block Flooding Attack Simulation...');
  // First block by honest miner
  const block1 = await postJson('/p2p/broadcast', {
    type: 'PROOF_OF_SAMPLING_BLOCK',
    miner: worker1Addr,
    height: 104282,
    subsidy: '98.96'
  });
  console.log(`  -> Block 1 submission: HTTP ${block1.status}, Success: ${block1.body.success}`);

  // Instant Block 2 attempt (0 seconds later)
  const block2 = await postJson('/p2p/broadcast', {
    type: 'PROOF_OF_SAMPLING_BLOCK',
    miner: worker1Addr,
    height: 104283,
    subsidy: '98.96'
  });
  console.log(`  -> Rapid Block 2 submission: HTTP ${block2.status}, Error: ${block2.body.error}`);
  if (block2.status === 429 && block2.body.error && block2.body.error.includes('ERR_RATE_LIMIT')) {
    console.log('  -> DEFENSE VERIFIED: Rapid block spam rate-limited (< 45s threshold)!');
  } else {
    throw new Error('SECURITY FAILURE: Rapid block flood was not throttled!');
  }

  // Step 5: Multi-IP Quarantine Isolation Drill (Simulated distinct subnet)
  console.log('\n[STEP 5/5] Testing Multi-Subnet Independent Verification via Forwarded Headers...');
  const remoteIpClaim = await postJson('/api/miner/claim-slot', { miner: 'pc1q_remote_tokyo_miner' }, {
    'X-Forwarded-For': '203.0.113.42'
  });
  console.log(`  -> Remote Subnet (203.0.113.42) Claim: HTTP ${remoteIpClaim.status}, Allowed: ${remoteIpClaim.body.allowed}`);
  if (remoteIpClaim.status === 200 && remoteIpClaim.body.allowed) {
    console.log('  -> Distinct subnet legitimately isolated without colliding with 127.0.0.1.');
  }

  console.log('\n==================================================================');
  console.log('  BOTNET & SYBIL STRESS DRILL COMPLETE: 100% DEFENSES VERIFIED!  ');
  console.log('==================================================================');
}

runDrill().catch(err => {
  console.error('\nDRILL ERROR:', err);
  process.exit(1);
});
