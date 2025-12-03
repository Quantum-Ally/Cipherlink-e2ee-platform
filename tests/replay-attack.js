/**
 * REPLAY ATTACK DEMONSTRATION AND TESTING
 * 
 * This script demonstrates comprehensive replay attack protection
 * using three layers of defense:
 * 1. NONCES - Unique random values that cannot be reused
 * 2. TIMESTAMPS - Time-based validation (5-minute window)
 * 3. SEQUENCE NUMBERS - Monotonically increasing counters
 * 
 * The test performs actual attacks against the server to verify
 * that all protection mechanisms work correctly.
 */

import axios from 'axios';
import crypto from 'crypto';

const API_URL = process.env.API_URL || 'http://localhost:5000/api';

// Test users
let attackerToken = null;
let victimToken = null;
let attackerId = null;
let victimId = null;

/**
 * Generate a cryptographically secure nonce (16 bytes = 128 bits)
 */
function generateNonce() {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Generate a dummy public key for testing (base64 encoded)
 * In production, this would be a real RSA/ECDH public key
 */
function generatePublicKey() {
  // Generate 256 bytes to simulate a public key
  return crypto.randomBytes(256).toString('base64');
}

/**
 * Create a test message with replay protection parameters
 */
function createTestMessage(recipientId, sequenceNumber, customNonce = null, customTimestamp = null) {
  return {
    recipientId,
    ciphertext: Buffer.from('encrypted_message_data').toString('base64'),
    iv: Buffer.from(crypto.randomBytes(12)).toString('base64'),
    tag: Buffer.from(crypto.randomBytes(16)).toString('base64'),
    nonce: customNonce || generateNonce(),
    timestamp: customTimestamp || Date.now(),
    sequenceNumber: sequenceNumber || 1,
  };
}

/**
 * Setup: Register test users
 */
async function setupTestUsers() {
  console.log('\n=== SETUP: Creating Test Users ===\n');
  
  try {
    // Register attacker
    const attackerRes = await axios.post(`${API_URL}/auth/register`, {
      username: `attacker_${Date.now()}`,
      password: 'Attacker123!@#',
      publicKey: generatePublicKey(),
    });
    attackerToken = attackerRes.data.token;
    attackerId = attackerRes.data.user.id;
    console.log('✓ Attacker registered:', attackerId);

    // Register victim
    const victimRes = await axios.post(`${API_URL}/auth/register`, {
      username: `victim_${Date.now()}`,
      password: 'Victim123!@#',
      publicKey: generatePublicKey(),
    });
    victimToken = victimRes.data.token;
    victimId = victimRes.data.user.id;
    console.log('✓ Victim registered:', victimId);
    
    return true;
  } catch (error) {
    console.error('Setup failed:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Test 1: Legitimate message (should succeed)
 */
async function testLegitimateMessage() {
  console.log('\n=== TEST 1: Legitimate Message ===');
  console.log('Expected: Message accepted ✓\n');
  
  try {
    const message = createTestMessage(victimId, 1);
    console.log('Sending legitimate message:');
    console.log(`  - Nonce: ${message.nonce.substring(0, 12)}...`);
    console.log(`  - Timestamp: ${new Date(message.timestamp).toISOString()}`);
    console.log(`  - Sequence Number: ${message.sequenceNumber}`);
    
    const response = await axios.post(
      `${API_URL}/messages/send`,
      message,
      { headers: { Authorization: `Bearer ${attackerToken}` } }
    );
    
    console.log('✓ Message accepted by server');
    console.log(`  Message ID: ${response.data.messageId}\n`);
    return { success: true, message };
  } catch (error) {
    console.error('✗ Unexpected failure:', error.response?.data || error.message);
    return { success: false };
  }
}

/**
 * Test 2: NONCE replay attack (duplicate nonce)
 */
async function testNonceReplayAttack(originalMessage) {
  console.log('\n=== TEST 2: Nonce Replay Attack ===');
  console.log('Attack: Reusing the same nonce from a previous message');
  console.log('Expected: REJECTED - Duplicate nonce detected ✗\n');
  
  try {
    // Create new message but reuse the nonce
    const replayedMessage = createTestMessage(
      victimId,
      2, // Different sequence number
      originalMessage.nonce, // SAME nonce (attack!)
      Date.now() // Current timestamp
    );
    
    console.log('Attempting replay with duplicate nonce:');
    console.log(`  - Nonce (REUSED): ${replayedMessage.nonce.substring(0, 12)}...`);
    console.log(`  - Timestamp: ${new Date(replayedMessage.timestamp).toISOString()}`);
    console.log(`  - Sequence Number: ${replayedMessage.sequenceNumber}`);
    
    await axios.post(
      `${API_URL}/messages/send`,
      replayedMessage,
      { headers: { Authorization: `Bearer ${attackerToken}` } }
    );
    
    console.error('✗ SECURITY FAILURE: Replay attack succeeded (should have been blocked!)');
    return false;
  } catch (error) {
    if (error.response?.status === 400 && 
        error.response?.data?.error?.includes('duplicate nonce')) {
      console.log('✓ REPLAY BLOCKED: ' + error.response.data.error);
      console.log('  Protection layer: NONCE validation\n');
      return true;
    }
    console.error('✗ Unexpected error:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Test 3: TIMESTAMP replay attack (old message)
 */
async function testTimestampReplayAttack() {
  console.log('\n=== TEST 3: Timestamp Replay Attack ===');
  console.log('Attack: Sending message with old timestamp (6 minutes ago)');
  console.log('Expected: REJECTED - Timestamp too old ✗\n');
  
  try {
    // Create message with timestamp from 6 minutes ago (exceeds 5-minute limit)
    const oldTimestamp = Date.now() - (6 * 60 * 1000);
    const oldMessage = createTestMessage(
      victimId,
      3,
      null, // New nonce
      oldTimestamp // OLD timestamp (attack!)
    );
    
    console.log('Attempting replay with old timestamp:');
    console.log(`  - Nonce: ${oldMessage.nonce.substring(0, 12)}...`);
    console.log(`  - Timestamp: ${new Date(oldMessage.timestamp).toISOString()} (6 min old)`);
    console.log(`  - Sequence Number: ${oldMessage.sequenceNumber}`);
    
    await axios.post(
      `${API_URL}/messages/send`,
      oldMessage,
      { headers: { Authorization: `Bearer ${attackerToken}` } }
    );
    
    console.error('✗ SECURITY FAILURE: Old timestamp accepted (should have been blocked!)');
    return false;
  } catch (error) {
    if (error.response?.status === 400 && 
        error.response?.data?.error?.includes('too old')) {
      console.log('✓ REPLAY BLOCKED: ' + error.response.data.error);
      console.log('  Protection layer: TIMESTAMP validation\n');
      return true;
    }
    console.error('✗ Unexpected error:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Test 4: FUTURE TIMESTAMP attack
 */
async function testFutureTimestampAttack() {
  console.log('\n=== TEST 4: Future Timestamp Attack ===');
  console.log('Attack: Sending message with future timestamp (2 minutes ahead)');
  console.log('Expected: REJECTED - Timestamp from future ✗\n');
  
  try {
    // Create message with timestamp from future
    const futureTimestamp = Date.now() + (2 * 60 * 1000);
    const futureMessage = createTestMessage(
      victimId,
      4,
      null,
      futureTimestamp // FUTURE timestamp (attack!)
    );
    
    console.log('Attempting message with future timestamp:');
    console.log(`  - Nonce: ${futureMessage.nonce.substring(0, 12)}...`);
    console.log(`  - Timestamp: ${new Date(futureMessage.timestamp).toISOString()} (2 min ahead)`);
    console.log(`  - Sequence Number: ${futureMessage.sequenceNumber}`);
    
    await axios.post(
      `${API_URL}/messages/send`,
      futureMessage,
      { headers: { Authorization: `Bearer ${attackerToken}` } }
    );
    
    console.error('✗ SECURITY FAILURE: Future timestamp accepted (should have been blocked!)');
    return false;
  } catch (error) {
    if (error.response?.status === 400 && 
        error.response?.data?.error?.includes('future')) {
      console.log('✓ ATTACK BLOCKED: ' + error.response.data.error);
      console.log('  Protection layer: TIMESTAMP validation\n');
      return true;
    }
    console.error('✗ Unexpected error:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Test 5: SEQUENCE NUMBER replay attack (old sequence)
 */
async function testSequenceReplayAttack() {
  console.log('\n=== TEST 5: Sequence Number Replay Attack ===');
  console.log('Attack: Sending message with old sequence number');
  console.log('Expected: REJECTED - Invalid sequence number ✗\n');
  
  try {
    // First send a legitimate message with sequence 10
    const message1 = createTestMessage(victimId, 10);
    await axios.post(
      `${API_URL}/messages/send`,
      message1,
      { headers: { Authorization: `Bearer ${attackerToken}` } }
    );
    console.log('✓ Sent message with sequence number 10');
    
    // Now try to send message with lower sequence number (attack!)
    const replayMessage = createTestMessage(
      victimId,
      5, // LOWER sequence number (attack!)
      null,
      Date.now()
    );
    
    console.log('\nAttempting replay with old sequence number:');
    console.log(`  - Nonce: ${replayMessage.nonce.substring(0, 12)}...`);
    console.log(`  - Timestamp: ${new Date(replayMessage.timestamp).toISOString()}`);
    console.log(`  - Sequence Number: ${replayMessage.sequenceNumber} (previous was 10)`);
    
    await axios.post(
      `${API_URL}/messages/send`,
      replayMessage,
      { headers: { Authorization: `Bearer ${attackerToken}` } }
    );
    
    console.error('✗ SECURITY FAILURE: Old sequence accepted (should have been blocked!)');
    return false;
  } catch (error) {
    if (error.response?.status === 400 && 
        error.response?.data?.error?.includes('sequence')) {
      console.log('✓ REPLAY BLOCKED: ' + error.response.data.error);
      console.log('  Protection layer: SEQUENCE NUMBER validation\n');
      return true;
    }
    console.error('✗ Unexpected error:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Test 6: Complete message replay
 */
async function testCompleteMessageReplay() {
  console.log('\n=== TEST 6: Complete Message Replay ===');
  console.log('Attack: Replaying entire captured message');
  console.log('Expected: REJECTED - Multiple protection layers triggered ✗\n');
  
  try {
    // Send original message
    const original = createTestMessage(victimId, 20);
    await axios.post(
      `${API_URL}/messages/send`,
      original,
      { headers: { Authorization: `Bearer ${attackerToken}` } }
    );
    console.log('✓ Original message sent successfully');
    
    // Wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Try to replay the EXACT same message
    console.log('\nAttempting complete message replay:');
    console.log(`  - Nonce: ${original.nonce.substring(0, 12)}... (IDENTICAL)`);
    console.log(`  - Timestamp: ${new Date(original.timestamp).toISOString()} (IDENTICAL)`);
    console.log(`  - Sequence: ${original.sequenceNumber} (IDENTICAL)`);
    console.log('  - All fields identical to original message');
    
    await axios.post(
      `${API_URL}/messages/send`,
      original, // EXACT same message (attack!)
      { headers: { Authorization: `Bearer ${attackerToken}` } }
    );
    
    console.error('✗ CRITICAL SECURITY FAILURE: Complete replay succeeded!');
    return false;
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✓ REPLAY BLOCKED: ' + error.response.data.error);
      console.log('  All protection layers working correctly\n');
      return true;
    }
    console.error('✗ Unexpected error:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Test 7: Missing replay protection fields
 */
async function testMissingFields() {
  console.log('\n=== TEST 7: Missing Replay Protection Fields ===');
  console.log('Attack: Sending message without replay protection');
  console.log('Expected: REJECTED - Missing required fields ✗\n');
  
  const tests = [
    { name: 'Missing nonce', field: 'nonce' },
    { name: 'Missing timestamp', field: 'timestamp' },
    { name: 'Missing sequence number', field: 'sequenceNumber' },
  ];
  
  let allPassed = true;
  
  for (const test of tests) {
    try {
      const message = createTestMessage(victimId, 30);
      delete message[test.field]; // Remove field
      
      console.log(`Testing: ${test.name}`);
      await axios.post(
        `${API_URL}/messages/send`,
        message,
        { headers: { Authorization: `Bearer ${attackerToken}` } }
      );
      
      console.error(`✗ FAILURE: Message accepted without ${test.field}`);
      allPassed = false;
    } catch (error) {
      if (error.response?.status === 400) {
        console.log(`✓ BLOCKED: ${error.response.data.error}`);
      } else {
        console.error(`✗ Unexpected error for ${test.name}`);
        allPassed = false;
      }
    }
  }
  
  console.log();
  return allPassed;
}

/**
 * Main test execution
 */
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       REPLAY ATTACK PROTECTION - COMPREHENSIVE TEST           ║');
  console.log('║                                                                ║');
  console.log('║  Testing three layers of replay attack protection:            ║');
  console.log('║  1. NONCES - Cryptographically random, unique values          ║');
  console.log('║  2. TIMESTAMPS - Time-based validation (5-minute window)      ║');
  console.log('║  3. SEQUENCE NUMBERS - Monotonically increasing counters      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  // Setup
  const setupSuccess = await setupTestUsers();
  if (!setupSuccess) {
    console.error('\n✗ Setup failed. Ensure server is running at', API_URL);
    process.exit(1);
  }
  
  // Run tests
  const results = {
    legitimate: false,
    nonceReplay: false,
    timestampReplay: false,
    futureTimestamp: false,
    sequenceReplay: false,
    completeReplay: false,
    missingFields: false,
  };
  
  // Test 1: Legitimate message
  const legitimateResult = await testLegitimateMessage();
  results.legitimate = legitimateResult.success;
  
  if (!legitimateResult.success) {
    console.error('\n✗ Cannot proceed - legitimate messages are being rejected');
    console.error('Check server logs and ensure replay protection is configured correctly');
    process.exit(1);
  }
  
  // Test 2-7: Attack scenarios
  results.nonceReplay = await testNonceReplayAttack(legitimateResult.message);
  results.timestampReplay = await testTimestampReplayAttack();
  results.futureTimestamp = await testFutureTimestampAttack();
  results.sequenceReplay = await testSequenceReplayAttack();
  results.completeReplay = await testCompleteMessageReplay();
  results.missingFields = await testMissingFields();
  
  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                        TEST SUMMARY                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Legitimate Message:           ${results.legitimate ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Nonce Replay Protection:      ${results.nonceReplay ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Timestamp Replay Protection:  ${results.timestampReplay ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Future Timestamp Protection:  ${results.futureTimestamp ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Sequence Number Protection:   ${results.sequenceReplay ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Complete Replay Protection:   ${results.completeReplay ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Missing Fields Protection:    ${results.missingFields ? '✓ PASS' : '✗ FAIL'}`);
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(r => r).length;
  
  console.log('\n' + '═'.repeat(64));
  console.log(`Total: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('\n✓ ALL REPLAY PROTECTION TESTS PASSED!');
    console.log('The system successfully defends against replay attacks.\n');
  } else {
    console.log('\n✗ SOME TESTS FAILED - SECURITY VULNERABILITIES DETECTED!');
    console.log('Review the failed tests and fix the replay protection.\n');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n✗ Test execution failed:', error.message);
  process.exit(1);
});


