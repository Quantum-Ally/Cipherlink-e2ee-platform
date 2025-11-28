# Message Flow Guide - E2EE Platform

## Complete Message Flow According to Requirements

### 1. **User Registration & Key Generation**
```
User registers → Generates RSA-2048 key pair (RSA-PSS)
→ Public key sent to server
→ Private key encrypted and stored in IndexedDB (client-side only)
```

### 2. **Key Exchange Protocol (Custom ECDH + RSA-PSS)**
When User A wants to chat with User B:

**Step 1: Initiate Key Exchange**
- User A generates ECDH key pair (P-256)
- User A signs their ECDH public key with their RSA private key
- Sends: `{ publicKey, signature, timestamp }` to server
- Server stores exchange request

**Step 2: Response**
- User A (or User B) responds with their ECDH public key
- Signs response with their RSA private key
- Server verifies signature

**Step 3: Key Derivation**
- Both users derive shared secret using ECDH
- Derive session key using HKDF/SHA-256
- Store session key locally (IndexedDB)

**Step 4: Confirmation**
- Send confirmation hash to verify both parties have the same key
- Exchange is complete

### 3. **Message Sending Flow**
```
User A types message
→ Encrypts with AES-256-GCM using session key
→ Generates fresh IV, nonce, sequence number
→ Sends encrypted message to server
→ Server stores: { ciphertext, iv, tag, nonce, sequenceNumber, metadata }
→ Server CANNOT decrypt (no plaintext stored)
```

### 4. **Message Receiving Flow** ⚠️ CURRENT ISSUE
```
User B opens chat with User A
→ Checks if session key exists
→ If not: Establishes session key (key exchange)
→ Loads messages from server
→ Decrypts each message using session key
→ Displays decrypted messages
```

### 5. **Replay Attack Protection**
- Each message has unique nonce
- Sequence numbers prevent reordering
- Timestamps prevent old message replay
- Server rejects duplicate nonces

---

## Current Problem: Messages Not Being Received

### Issue Analysis:
1. ✅ **Message sent successfully** - Server logs show message saved
2. ✅ **Key exchange works** - Both users can establish session
3. ❌ **Recipient can't see messages** - Messages not loading/decrypting

### Root Causes:
1. **Session Key Not Established for Recipient**
   - When User B opens chat, they need to establish session key
   - Currently, session key is only established when sending a message
   - Need to auto-establish when opening chat

2. **Messages Not Auto-Reloading**
   - After establishing session, messages should reload
   - Need polling or real-time updates

3. **Decryption Failing**
   - Session key might be wrong direction
   - Need to ensure both users use same session key

---

## Solution: Fix Message Receiving

### Fix 1: Auto-Establish Session When Opening Chat
- When user opens a chat, check if session key exists
- If not, automatically initiate key exchange
- Reload messages after session established

### Fix 2: Poll for New Messages
- Periodically check for new messages (every 2-3 seconds)
- Or implement WebSocket for real-time updates (optional)

### Fix 3: Ensure Bidirectional Session Keys
- Both users should be able to decrypt messages
- Session key should work for both directions

---

## Expected Behavior After Fix:

1. **User A sends message** → Saved to database ✅
2. **User B opens chat** → Auto-establishes session → Loads messages → Decrypts → Displays ✅
3. **User B sends reply** → Encrypts → Sends → User A sees it ✅
4. **Real-time updates** → Messages appear without refresh ✅

---

## Next Steps:
1. Fix auto-session establishment on chat open
2. Add message polling/refresh mechanism
3. Test bidirectional messaging
4. Add file sharing functionality
5. Implement attack demonstrations (MITM, Replay)

