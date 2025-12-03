# Security Tests & Attack Demonstrations

This directory contains comprehensive security attack demonstrations and tests for the CipherLink platform.

## Available Tests

### 1. MITM Attack Demonstration

**File:** `mitm-attack.js`

**Purpose:** Demonstrates how Man-in-the-Middle attacks work and how digital signatures prevent them.

**Usage:**
```bash
cd tests
node mitm-attack.js
```

**What it shows:**
1. How MITM attack works WITHOUT signatures (vulnerable)
2. How MITM attack is prevented WITH signatures (secure)
3. Explanation of the protection mechanism

---

### 2. Replay Attack Test Suite

**File:** `replay-attack.js`

**Purpose:** Comprehensive test suite that demonstrates replay attack protection using three independent layers:
1. **Nonces** - Cryptographically secure unique values
2. **Timestamps** - Time-based validation (5-minute window)
3. **Sequence Numbers** - Monotonically increasing counters

**Usage:**
```bash
# Ensure server is running first
cd server
npm start

# In a new terminal, run the test
cd tests
node replay-attack.js
```

**What it tests:**
- ✓ Legitimate message acceptance
- ✗ Duplicate nonce rejection (LAYER 1)
- ✗ Old timestamp rejection (LAYER 2)
- ✗ Future timestamp rejection (LAYER 2)
- ✗ Invalid sequence number rejection (LAYER 3)
- ✗ Complete message replay rejection (ALL LAYERS)
- ✗ Missing replay protection fields rejection

**Expected Output:**
```
╔════════════════════════════════════════════════════════════════╗
║       REPLAY ATTACK PROTECTION - COMPREHENSIVE TEST           ║
╚════════════════════════════════════════════════════════════════╝

=== TEST 1: Legitimate Message ===
✓ Message accepted by server

=== TEST 2: Nonce Replay Attack ===
✓ REPLAY BLOCKED: Replay attack detected: duplicate nonce

... [6 more tests] ...

Total: 7/7 tests passed

✓ ALL REPLAY PROTECTION TESTS PASSED!
The system successfully defends against replay attacks.
```

---

## Prerequisites

Before running tests, ensure:

1. **Server Running**: 
   ```bash
   cd server
   npm install
   npm start
   ```

2. **MongoDB Running**:
   ```bash
   mongod
   # Or: brew services start mongodb-community
   ```

3. **Environment Variables**:
   - `JWT_SECRET` must be set in `server/.env`
   - `MONGODB_URI` must point to running MongoDB instance

4. **Dependencies Installed**:
   ```bash
   cd server
   npm install
   ```

---

## Test Architecture

### Replay Attack Test Flow

```
1. Setup Phase
   ├─ Register test users (attacker & victim)
   └─ Obtain authentication tokens

2. Test Phase
   ├─ Test 1: Send legitimate message → PASS
   ├─ Test 2: Replay with same nonce → BLOCKED (Nonce layer)
   ├─ Test 3: Replay with old timestamp → BLOCKED (Timestamp layer)
   ├─ Test 4: Replay with future timestamp → BLOCKED (Timestamp layer)
   ├─ Test 5: Replay with old sequence → BLOCKED (Sequence layer)
   ├─ Test 6: Complete message replay → BLOCKED (All layers)
   └─ Test 7: Missing fields → BLOCKED (Validation layer)

3. Results Phase
   └─ Generate summary report with pass/fail status
```

---

## Security Logging

All test attacks are logged in `server/logs/` with daily rotation:

```bash
# View today's replay attack logs
cat ../server/logs/replay_attack_*-$(date +%Y-%m-%d).log | jq '.'

# Count attacks by type
cat ../server/logs/*-$(date +%Y-%m-%d).log | jq -r '.eventType' | sort | uniq -c | sort -rn

# Most recent attack
cat ../server/logs/replay_attack_*-$(date +%Y-%m-%d).log | tail -1 | jq '.'
```

**Log Entry Structure:**
```json
{
  "timestamp": "2025-12-03T10:30:45.123Z",
  "eventType": "replay_attack_duplicate_nonce",
  "userId": "507f1f77bcf86cd799439011",
  "recipientId": "507f191e810c19729de860ea",
  "nonce": "abcdef123456...",
  "sequenceNumber": 5,
  "previousUse": { ... }
}
```

---

## Troubleshooting

### ❌ Test Fails: "Connection refused"
**Problem:** Server is not running  
**Solution:** Start the server first
```bash
cd server
npm start
```

### ❌ Test Fails: "JWT secret not configured"
**Problem:** Missing JWT_SECRET in .env  
**Solution:** Add to `server/.env`:
```bash
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

### ❌ Test Fails: "MongoDB connection error"
**Problem:** MongoDB is not running  
**Solution:** 
```bash
# Start MongoDB
mongod
# Or on macOS with Homebrew
brew services start mongodb-community
```

### ❌ All Replay Tests Fail
**Problem:** Replay protection cache not initialized  
**Solution:** Restart the server completely
```bash
# Kill server
# Restart with: npm start
```

### ❌ Tests Pass But Should Fail
**Problem:** Replay protection middleware not applied  
**Solution:** Check `server/routes/messages.js` includes:
```javascript
router.post('/send', authenticate, replayProtection, async (req, res) => {
```

---

## Documentation

For detailed implementation information:

- **Replay Protection Details**: `../REPLAY_PROTECTION.md`
- **Message Encryption**: `../client/src/crypto/messageEncryption.ts`
- **Server Middleware**: `../server/middleware/replayProtection.js`
- **Database Model**: `../server/models/Message.js`

---

## Manual Testing with cURL

You can also test replay protection manually:

```bash
# 1. Register a user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"Test123!@#"}'

# 2. Send a message (save the response)
curl -X POST http://localhost:5000/api/messages/send \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientId":"RECIPIENT_ID",
    "ciphertext":"encrypted",
    "iv":"iv_data",
    "tag":"tag_data",
    "nonce":"unique_nonce_12345",
    "timestamp":1234567890000,
    "sequenceNumber":1
  }'

# 3. Try to send the EXACT same message again
# (Should fail with "Replay attack detected")
[Repeat step 2 with identical data]
```

---

## Integration with Report

For your security report, capture:

1. **Screenshots** of test execution showing all tests passing
2. **Log files** from `server/logs/` showing blocked attacks
3. **Code snippets** from:
   - `replayProtection.js` - middleware implementation
   - `messageEncryption.ts` - client-side generation
   - `Message.js` - database constraints

4. **Network captures** (optional, using Wireshark):
   - Capture a legitimate message
   - Attempt to replay it
   - Show server rejection

---

## Adding New Tests

To add a new security test:

1. Create `your-test.js` in this directory
2. Follow this structure:
   ```javascript
   import axios from 'axios';
   
   async function setupTest() {
     // Register users, get tokens
   }
   
   async function performAttack() {
     // Execute attack scenario
   }
   
   async function verifyProtection() {
     // Verify attack was blocked
   }
   
   async function runTest() {
     await setupTest();
     await performAttack();
     await verifyProtection();
   }
   
   runTest().catch(console.error);
   ```
3. Update this README
4. Add corresponding documentation

---

## Continuous Integration

Example GitHub Actions workflow:

```yaml
name: Security Tests

on: [push, pull_request]

jobs:
  security-tests:
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:latest
        ports:
          - 27017:27017
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Install dependencies
        run: cd server && npm install
      
      - name: Start server
        run: cd server && npm start &
        
      - name: Wait for server
        run: sleep 10
        
      - name: Run replay attack test
        run: cd tests && node replay-attack.js
        
      - name: Run MITM test
        run: cd tests && node mitm-attack.js
```

---

## Compliance Checklist

✅ **Nonces Implemented**: Cryptographically secure random values  
✅ **Timestamps Implemented**: 5-minute validation window  
✅ **Sequence Numbers Implemented**: Monotonic counters per conversation  
✅ **Verification Logic**: Comprehensive middleware with all checks  
✅ **Attack Demonstration**: Full test suite with 7 test cases  
✅ **Security Logging**: All attacks logged with full context  
✅ **Documentation**: Complete implementation guide (REPLAY_PROTECTION.md)

---

## Notes

- These are **actual functional tests** that make real API calls
- The server **must be running** for tests to work
- All attacks are **logged** for security auditing
- Tests demonstrate **defense-in-depth** with multiple layers
- For BurpSuite/Wireshark testing, capture the network traffic during test execution


