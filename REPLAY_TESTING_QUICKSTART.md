# Quick Start - Replay Attack Protection Testing

## 1. Start the Server

```powershell
cd d:\Projects\INFO_SEC\Cipherlink-e2ee-platform\server
npm start
```

Wait for:
```
[AUTH] Server running on port 5000
[AUTH] MongoDB connected
```

## 2. Run Replay Attack Test

Open a **new terminal**:

```powershell
cd d:\Projects\INFO_SEC\Cipherlink-e2ee-platform\tests
node replay-attack.js
```

## 3. Expected Results

You should see:

```
╔════════════════════════════════════════════════════════════════╗
║       REPLAY ATTACK PROTECTION - COMPREHENSIVE TEST           ║
╚════════════════════════════════════════════════════════════════╝

=== SETUP: Creating Test Users ===
✓ Attacker registered
✓ Victim registered

=== TEST 1: Legitimate Message ===
✓ Message accepted by server

=== TEST 2: Nonce Replay Attack ===
✓ REPLAY BLOCKED: Replay attack detected: duplicate nonce

=== TEST 3: Timestamp Replay Attack ===
✓ REPLAY BLOCKED: Replay attack detected: message too old

=== TEST 4: Future Timestamp Attack ===
✓ ATTACK BLOCKED: Replay attack detected: message from future

=== TEST 5: Sequence Number Replay Attack ===
✓ REPLAY BLOCKED: Replay attack detected: invalid sequence number

=== TEST 6: Complete Message Replay ===
✓ REPLAY BLOCKED: Replay attack detected: duplicate nonce

=== TEST 7: Missing Replay Protection Fields ===
✓ BLOCKED: Missing replay protection fields (3x)

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
The system successfully defends against replay attacks.
```

## 4. Check Security Logs

```powershell
cd d:\Projects\INFO_SEC\Cipherlink-e2ee-platform\server\logs

# View replay attack logs (if you have jq installed)
Get-Content replay_attack_*.log | ConvertFrom-Json | Format-List

# Or just view the file
Get-Content replay_attack_*.log
```

## 5. Understanding the Output

### ✓ PASS = Attack was properly blocked
- The server detected the replay attack
- The malicious message was rejected
- The protection layer worked correctly

### Test Descriptions

1. **Legitimate Message** - Normal message should be accepted
2. **Nonce Replay** - Reusing same nonce should be blocked
3. **Old Timestamp** - Message >5 minutes old should be blocked  
4. **Future Timestamp** - Message from future should be blocked
5. **Sequence Replay** - Lower sequence number should be blocked
6. **Complete Replay** - Exact message replay should be blocked
7. **Missing Fields** - Message without protection fields should be blocked

## 6. Troubleshooting

### Error: "Connection refused"
**Problem**: Server not running  
**Solution**: Start server in step 1 first

### Error: "JWT secret not configured"  
**Problem**: Missing JWT_SECRET  
**Solution**: Already added to `.env`, just restart server

### Error: "MongoDB connection error"
**Problem**: MongoDB not running  
**Solution**:
```powershell
# Start MongoDB
mongod
```

### All tests fail
**Problem**: Server cache not initialized  
**Solution**: Restart server completely (Ctrl+C and `npm start`)

## 7. What's Being Tested?

### Three Layers of Protection

```
Layer 1: NONCES
├─ Cryptographically random 128-bit values
├─ Must be unique for every message
└─ Server caches used nonces

Layer 2: TIMESTAMPS  
├─ Messages must be sent within 5 minutes
├─ Future messages rejected (1-min tolerance)
└─ Old messages rejected

Layer 3: SEQUENCE NUMBERS
├─ Monotonically increasing per conversation
├─ Must be > previous message
└─ Server tracks last sequence number
```

### Attack Scenarios Tested

1. **Duplicate Nonce** → Blocked by Layer 1
2. **Old Message** → Blocked by Layer 2
3. **Future Message** → Blocked by Layer 2
4. **Old Sequence** → Blocked by Layer 3
5. **Complete Replay** → Blocked by Layers 1+2+3
6. **Missing Protection** → Blocked by validation

## 8. For Your Report

### Capture These Items:

1. **Screenshot** of test output showing all 7/7 tests passed
2. **Log file** from `server/logs/replay_attack_*.log`
3. **Code snippets** from:
   - `server/middleware/replayProtection.js`
   - `client/src/crypto/messageEncryption.ts`
4. **Network capture** (optional):
   - Use Wireshark during test execution
   - Show server rejecting replayed messages

### Key Points for Report:

✅ **Nonces**: 128-bit cryptographic random values, server-side cache  
✅ **Timestamps**: 5-minute validation window  
✅ **Sequence Numbers**: Monotonic counters per conversation  
✅ **Verification**: Multi-layer middleware validates all fields  
✅ **Demonstration**: 7 test cases, all attacks blocked  

## 9. Documentation

- **Full Details**: `REPLAY_PROTECTION.md`
- **Summary**: `REPLAY_PROTECTION_SUMMARY.md`
- **Test Guide**: `tests/README.md`

## 10. Success Criteria

✓ Server starts without errors  
✓ Test suite runs to completion  
✓ All 7 tests show "✓ PASS"  
✓ Security logs contain attack attempts  
✓ No unexpected errors in server console  

---

**You're done!** The replay attack protection is fully implemented and tested.
