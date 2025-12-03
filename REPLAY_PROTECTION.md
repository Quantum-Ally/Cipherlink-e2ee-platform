# Replay Attack Protection - Implementation Documentation

## Overview

This document describes the comprehensive replay attack protection implementation in CipherLink. Our system employs **three independent layers of defense** to prevent replay attacks, ensuring that captured messages cannot be retransmitted by attackers.

## Table of Contents

1. [Protection Mechanisms](#protection-mechanisms)
2. [Implementation Details](#implementation-details)
3. [Attack Demonstration](#attack-demonstration)
4. [Security Analysis](#security-analysis)
5. [Testing](#testing)

---

## Protection Mechanisms

### 1. Nonces (Number used ONCE)

**Purpose**: Ensure each message has a unique identifier that can never be reused.

**Implementation**:
- **Generation**: 128-bit cryptographically secure random values using `crypto.getRandomValues()` (client) and `crypto.randomBytes()` (server)
- **Format**: Base64-encoded string for transmission
- **Storage**: In-memory cache on server with automatic expiration
- **Validation**: 
  - Checked against cache before accepting message
  - Database-level uniqueness constraint as fallback
  - Duplicate nonces are immediately rejected

**Code Location**:
- Client: `client/src/crypto/messageEncryption.ts` - `generateNonce()`
- Server: `server/middleware/replayProtection.js` - Nonce cache validation

```typescript
// Client-side nonce generation
function generateNonce(): string {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...nonceBytes))
}
```

### 2. Timestamps

**Purpose**: Ensure messages are recent and reject stale messages.

**Implementation**:
- **Window**: Messages must be within 5 minutes (300 seconds) of server time
- **Clock Skew**: Allows 1 minute tolerance for clock differences
- **Validation**:
  - Reject messages from the future (beyond 1-minute skew)
  - Reject messages older than 5 minutes
  - Calculated as `timeDiff = serverTime - messageTimestamp`

**Code Location**:
- Client: `client/src/crypto/messageEncryption.ts` - `timestamp: Date.now()`
- Server: `server/middleware/replayProtection.js` - Timestamp validation

```javascript
// Server-side timestamp validation
const now = Date.now();
const timeDiff = now - timestamp;

// Check if message is from the future (allow 1 minute clock skew)
if (timeDiff < -60000) {
  return res.status(400).json({ error: 'Replay attack detected: message from future' });
}

// Check if message is too old
if (timeDiff > MAX_NONCE_AGE) {
  return res.status(400).json({ error: 'Replay attack detected: message too old' });
}
```

### 3. Sequence Numbers

**Purpose**: Ensure messages are ordered and prevent out-of-order replay attacks.

**Implementation**:
- **Counter**: Monotonically increasing per-conversation counter
- **Tracking**: Both in-memory (fast) and database (persistent) tracking
- **Validation**:
  - Each new message must have sequence number > last message
  - Sequence numbers cannot go backwards
  - Large gaps (>10) are logged as warnings

**Code Location**:
- Client: `client/src/crypto/messageEncryption.ts` - `getSequenceNumber()`
- Server: `server/middleware/replayProtection.js` - Sequence validation
- Database: `server/models/Message.js` - Pre-save validation

```typescript
// Client-side sequence tracking
let sequenceCounters = new Map<string, number>()

function getSequenceNumber(conversationId: string): number {
  const current = sequenceCounters.get(conversationId) || 0
  const next = current + 1
  sequenceCounters.set(conversationId, next)
  return next
}
```

```javascript
// Server-side sequence validation
if (sequenceNumber <= lastSequence) {
  logSecurityEvent('replay_attack_invalid_sequence', {
    userId: senderId,
    recipientId,
    sequenceNumber,
    expectedMinimum: lastSequence + 1,
  });
  return res.status(400).json({ 
    error: 'Replay attack detected: invalid sequence number'
  });
}
```

---

## Implementation Details

### Client-Side Implementation

#### Message Encryption (`messageEncryption.ts`)

```typescript
export async function encryptMessage(
  message: string,
  sessionKey: CryptoKey,
  conversationId: string
): Promise<EncryptedMessage> {
  // Generate replay protection parameters
  const nonce = generateNonce()           // 128-bit random
  const sequenceNumber = getSequenceNumber(conversationId)  // Monotonic
  const timestamp = Date.now()            // Current time

  // ... encryption logic ...

  return {
    ciphertext,
    iv,
    tag,
    timestamp,      // ← Replay protection
    sequenceNumber, // ← Replay protection
    nonce,          // ← Replay protection
  }
}
```

### Server-Side Implementation

#### Replay Protection Middleware (`replayProtection.js`)

The middleware implements a three-stage validation pipeline:

```javascript
export const replayProtection = async (req, res, next) => {
  // Stage 1: Validate required fields
  if (!nonce || !timestamp || sequenceNumber === undefined) {
    return res.status(400).json({ error: 'Missing replay protection fields' });
  }

  // Stage 2: TIMESTAMP validation
  const now = Date.now();
  const timeDiff = now - timestamp;
  if (timeDiff < -60000 || timeDiff > MAX_NONCE_AGE) {
    // Log and reject
    return res.status(400).json({ error: 'Invalid timestamp' });
  }

  // Stage 3: NONCE validation
  if (nonceCache.has(nonce)) {
    // Log and reject
    return res.status(400).json({ error: 'Duplicate nonce' });
  }

  // Stage 4: SEQUENCE NUMBER validation
  const lastSequence = await getLastSequenceNumber(senderId, recipientId);
  if (sequenceNumber <= lastSequence) {
    // Log and reject
    return res.status(400).json({ error: 'Invalid sequence number' });
  }

  // All checks passed - store nonce and update sequence
  nonceCache.set(nonce, { timestamp, userId: senderId, recipientId });
  sequenceTracking.set(conversationKey, sequenceNumber);
  
  next();
}
```

#### Database Model (`Message.js`)

```javascript
const messageSchema = new mongoose.Schema({
  // ... other fields ...
  
  nonce: {
    type: String,
    required: true,
    unique: true,      // Database-level constraint
    minlength: 16,
  },
  
  timestamp: {
    type: Date,
    required: true,
    validate: {        // Timestamp range validation
      validator: function(v) {
        const now = Date.now();
        const diff = now - v.getTime();
        return diff >= -60000 && diff <= 5 * 60 * 1000;
      }
    }
  },
  
  sequenceNumber: {
    type: Number,
    required: true,
    min: 1,
    validate: {        // Must be positive integer
      validator: function(v) {
        return Number.isInteger(v) && v > 0;
      }
    }
  },
});

// Pre-save validation for sequence monotonicity
messageSchema.pre('save', async function(next) {
  const lastMessage = await Message.findOne({...}).sort({ sequenceNumber: -1 });
  if (lastMessage && this.sequenceNumber <= lastMessage.sequenceNumber) {
    return next(new Error('Sequence number must increase'));
  }
  next();
});
```

---

## Attack Demonstration

### Test Suite (`tests/replay-attack.js`)

We provide a comprehensive test suite that demonstrates actual replay attacks:

#### Test 1: Legitimate Message
- Sends a properly formatted message
- **Expected**: Message accepted ✓

#### Test 2: Nonce Replay Attack
- Reuses a nonce from a previous message
- **Expected**: REJECTED - "Duplicate nonce detected" ✗

#### Test 3: Timestamp Replay Attack (Old Message)
- Sends message with 6-minute-old timestamp
- **Expected**: REJECTED - "Message too old" ✗

#### Test 4: Future Timestamp Attack
- Sends message with timestamp 2 minutes in future
- **Expected**: REJECTED - "Message from future" ✗

#### Test 5: Sequence Number Replay Attack
- Sends message with lower sequence number than previous
- **Expected**: REJECTED - "Invalid sequence number" ✗

#### Test 6: Complete Message Replay
- Replays entire captured message (all fields identical)
- **Expected**: REJECTED by multiple layers ✗

#### Test 7: Missing Fields
- Attempts to send messages without replay protection fields
- **Expected**: REJECTED - "Missing required fields" ✗

### Running the Tests

```bash
# Start the server first
cd server
npm start

# In another terminal, run the replay attack test
cd tests
node replay-attack.js
```

**Expected Output**:
```
╔════════════════════════════════════════════════════════════════╗
║       REPLAY ATTACK PROTECTION - COMPREHENSIVE TEST           ║
╚════════════════════════════════════════════════════════════════╝

=== TEST 1: Legitimate Message ===
✓ Message accepted by server

=== TEST 2: Nonce Replay Attack ===
✓ REPLAY BLOCKED: Replay attack detected: duplicate nonce

=== TEST 3: Timestamp Replay Attack ===
✓ REPLAY BLOCKED: Replay attack detected: message too old

... [more tests] ...

╔════════════════════════════════════════════════════════════════╗
║                        TEST SUMMARY                            ║
╚════════════════════════════════════════════════════════════════╝

Legitimate Message:           ✓ PASS
Nonce Replay Protection:      ✓ PASS
Timestamp Replay Protection:  ✓ PASS
Future Timestamp Protection:  ✓ PASS
Sequence Number Protection:   ✓ PASS
Complete Replay Protection:   ✓ PASS
Missing Fields Protection:    ✓ PASS

Total: 7/7 tests passed

✓ ALL REPLAY PROTECTION TESTS PASSED!
```

---

## Security Analysis

### Why Three Layers?

Each layer addresses different attack vectors:

1. **Nonces**: Primary defense against exact message replay
   - Prevents attacker from replaying captured messages
   - Even if timestamp and sequence are valid, duplicate nonce fails

2. **Timestamps**: Defense against delayed replay
   - Prevents attacker from storing and replaying messages later
   - Limits attack window to 5 minutes
   - Protects against time-based attacks

3. **Sequence Numbers**: Defense against reordered replay
   - Prevents attacker from replaying old messages in conversation
   - Ensures message ordering is preserved
   - Detects gaps that might indicate attacks or network issues

### Defense in Depth

The three layers are **independent** and **complementary**:

- If an attacker somehow bypasses one layer, the others still protect
- Multiple validation failures provide stronger evidence of attack
- Each layer has different characteristics (random, temporal, sequential)

### Attack Scenarios and Defenses

| Attack Scenario | Nonce | Timestamp | Sequence | Result |
|----------------|-------|-----------|----------|---------|
| Replay captured message | ✓ Blocks | ✓ Blocks | ✓ Blocks | **BLOCKED** |
| Replay with new nonce | ✗ Passes | ✓ Blocks | ✓ Blocks | **BLOCKED** |
| Replay with new timestamp | ✗ Passes | ✗ Passes | ✓ Blocks | **BLOCKED** |
| Replay out-of-order | ✗ Passes | May Pass | ✓ Blocks | **BLOCKED** |
| All protection bypassed | ✗ Passes | ✗ Passes | ✗ Passes | **ALLOWED** |

### Performance Considerations

- **Nonce Cache**: In-memory cache with automatic cleanup (60s intervals)
  - Fast O(1) lookups
  - Memory bounded by 5-minute window
  - Scales with message rate, not user count

- **Sequence Tracking**: Two-tier approach
  - In-memory cache for fast validation
  - Database fallback for persistence
  - O(1) lookups with minimal DB queries

- **Timestamp Validation**: Simple arithmetic comparison
  - No external dependencies
  - Constant time O(1)

### Logging and Monitoring

All replay attempts are logged with full context:

```javascript
logSecurityEvent('replay_attack_duplicate_nonce', {
  userId: senderId,
  recipientId,
  nonce,
  previousUse,
  attemptedUse: { timestamp, sequenceNumber },
});
```

Log files are stored in `server/logs/` with daily rotation:
- `replay_attack_duplicate_nonce-YYYY-MM-DD.log`
- `replay_attack_old_timestamp-YYYY-MM-DD.log`
- `replay_attack_invalid_sequence-YYYY-MM-DD.log`

---

## Testing

### Manual Testing

1. **Test Nonce Protection**:
   ```bash
   # Send a message via the UI
   # Open browser dev tools → Network tab
   # Right-click the /messages/send request → Copy as cURL
   # Paste and run the cURL command twice
   # Second attempt should fail with "duplicate nonce"
   ```

2. **Test Timestamp Protection**:
   ```javascript
   // In browser console after sending a message
   // Modify timestamp to be 6 minutes old
   const oldMessage = {...lastMessage, timestamp: Date.now() - 6*60*1000};
   fetch('/api/messages/send', {
     method: 'POST',
     headers: {...},
     body: JSON.stringify(oldMessage)
   });
   // Should fail with "message too old"
   ```

3. **Test Sequence Protection**:
   ```javascript
   // Send message with sequence 10
   // Then try to send with sequence 5
   // Should fail with "invalid sequence number"
   ```

### Automated Testing

Run the comprehensive test suite:

```bash
cd tests
node replay-attack.js
```

### Monitoring

Check server logs for replay attempts:

```bash
# View all replay attack logs
cd server/logs
cat replay_attack_*-$(date +%Y-%m-%d).log | jq '.'

# Count replay attempts today
cat replay_attack_*-$(date +%Y-%m-%d).log | wc -l

# Most common attack type
cat *-$(date +%Y-%m-%d).log | jq -r '.eventType' | sort | uniq -c | sort -rn
```

---

## Compliance Summary

✅ **NONCES**: Implemented with cryptographically secure random generation  
✅ **TIMESTAMPS**: Implemented with 5-minute validation window  
✅ **SEQUENCE NUMBERS**: Implemented with monotonic counters per conversation  
✅ **VERIFICATION LOGIC**: Comprehensive middleware validates all three layers  
✅ **ATTACK DEMONSTRATION**: Complete test suite included in `tests/replay-attack.js`  

All requirements for replay attack protection have been fully implemented and tested.

---

## References

- **Nonce Generation**: Web Crypto API `crypto.getRandomValues()`
- **Middleware**: Express.js middleware pattern for validation
- **Database**: MongoDB with unique indexes and pre-save hooks
- **Logging**: Structured JSON logs with automatic rotation

## Contact

For questions or security concerns, please review the code in:
- `server/middleware/replayProtection.js`
- `client/src/crypto/messageEncryption.ts`
- `tests/replay-attack.js`
