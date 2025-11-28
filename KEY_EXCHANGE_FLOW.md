# Key Exchange Flow - How It Should Work

## Current Problem
Both users are initiating separate exchanges instead of one responding to the other's exchange.

## Correct Flow

### Scenario: User A (kamran) wants to chat with User B (sudan)

**Step 1: User A opens chat**
1. User A checks for pending exchanges from User B → Finds 0
2. User A initiates exchange → Sends ECDH public key A
3. Exchange stored on server with `fromUserId=A, toUserId=B`
4. User A returns `null` (waits for User B to respond)

**Step 2: User B opens chat**
1. User B checks for pending exchanges from User A → Finds 1 (User A's exchange)
2. User B responds to User A's exchange → Sends ECDH public key B
3. User B derives: `ECDH(private_B, public_A)` → Shared secret
4. User B derives session key using sorted user IDs
5. User B stores session key and confirms exchange
6. **User B now has session key**

**Step 3: User A needs to get User B's response**
1. User A needs to check for User B's response
2. When User B responded, the server should have the response
3. User A can derive: `ECDH(private_A, public_B)` → Same shared secret
4. User A derives same session key
5. **Both users now have the same session key**

## The Issue

Currently, when User B finds the pending exchange and responds, the code works. But:
- User A doesn't know User B has responded
- User A needs to poll or check for the response
- The server's `/response` endpoint returns the response data, but User A isn't checking it

## Solution

1. When User B responds, the server should store the response
2. User A should poll or check for responses to their initiated exchanges
3. Or: When User A sends a message, check if session key exists, if not, check for responses to pending exchanges

Let me implement a better solution: When User A initiates, store the exchange ID. When User A tries to send a message or load messages, check if there's a response to their exchange.

