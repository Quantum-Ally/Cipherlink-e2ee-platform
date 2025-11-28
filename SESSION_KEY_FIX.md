# Session Key Fix - Critical Update

## Problem
Messages were failing to decrypt with error: "Failed to decrypt message: Invalid key or corrupted data"

## Root Cause
The session key derivation was including the ECDH public key in the HKDF info parameter. Since each user generates a different ECDH public key for each exchange direction, this caused:
- User A (sudan) establishes session → derives key with sudan's ECDH public key
- User B (kamran) establishes session → derives key with kamran's ECDH public key
- **Result:** Different session keys, messages can't be decrypted

## Fix Applied
**File:** `client/src/crypto/keyExchange.ts`

Changed `deriveSessionKey` to use **ONLY sorted user IDs** in the HKDF info parameter, removing the ECDH public key:

```typescript
// Before:
info = `Cipherlink-Session-Key-${sortedIds[0]}-${sortedIds[1]}-${otherPublicKey}`

// After:
info = `Cipherlink-Session-Key-${sortedIds[0]}-${sortedIds[1]}`
```

Now both users derive the **same session key** regardless of who initiated the exchange.

## Action Required

### ⚠️ IMPORTANT: Clear Existing Session Keys

Since session keys are stored in memory, you need to:

1. **Hard refresh both browser windows** (Ctrl+Shift+R or Cmd+Shift+R)
   - This clears the in-memory session keys
   - Old keys were derived with the buggy algorithm

2. **Re-establish sessions:**
   - User A: Open chat with User B → Enter password → Session established
   - User B: Open chat with User A → Enter password → Session established
   - Both users will now derive the SAME session key

3. **Test messaging:**
   - User A sends message → Should work
   - User B receives and decrypts → Should work
   - User B sends reply → Should work
   - User A receives and decrypts → Should work

## Why Hard Refresh is Needed

Session keys are stored in a `Map` in memory (not persisted). A hard refresh:
- Clears the old buggy session keys
- Forces re-establishment with the fixed algorithm
- Ensures both users have matching keys

## Verification

After hard refresh and re-establishing sessions, check browser console:
- `[KEY EXCHANGE] Session key derived, storing...` - Should appear
- `[MESSAGE] Successfully decrypted message` - Should appear for all messages
- No more "Failed to decrypt" errors

## Technical Details

### How ECDH Works
- User A generates ECDH key pair (private_A, public_A)
- User B generates ECDH key pair (private_B, public_B)
- User A computes: sharedSecret = ECDH(private_A, public_B)
- User B computes: sharedSecret = ECDH(private_B, public_A)
- **Result:** Both get the SAME shared secret (ECDH is commutative)

### How HKDF Works
- Takes shared secret + salt + info → derives session key
- If `info` is different, session keys are different
- **Fix:** Use only sorted user IDs in `info`, so both users use the same `info`

## Future Improvements

Consider persisting session keys in IndexedDB so they survive page refreshes (encrypted with user's password).

