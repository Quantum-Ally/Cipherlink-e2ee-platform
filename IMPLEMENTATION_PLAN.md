# Detailed Implementation Plan
## Secure End-to-End Encrypted Messaging & File-Sharing System

**Technology Stack:**
- Frontend: React.js + Web Crypto API + IndexedDB
- Backend: Node.js + Express + MongoDB
- Real-time: Socket.io (optional)
- Security: bcrypt/argon2, HTTPS

---

## Phase 1: Project Setup & Infrastructure (Week 1)

### 1.1 Project Structure Setup
```
Cipherlink-e2ee-platform/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── services/      # API services
│   │   ├── crypto/        # Cryptographic functions
│   │   ├── storage/       # IndexedDB key storage
│   │   ├── utils/         # Helper functions
│   │   └── App.js
│   ├── public/
│   └── package.json
├── server/                # Node.js backend
│   ├── routes/           # API routes
│   ├── models/           # MongoDB models
│   ├── middleware/       # Auth, logging middleware
│   ├── utils/            # Server utilities
│   ├── logs/             # Security audit logs
│   └── server.js
├── docs/                 # Documentation
├── tests/                # Attack scripts
└── README.md
```

### 1.2 Initialize Projects
- **Client:** `npx create-react-app client`
- **Server:** Initialize Node.js project with Express
- **Database:** Setup MongoDB connection
- **Git:** Initialize private repository with proper .gitignore

### 1.3 Development Environment
- Install dependencies
- Setup environment variables (.env files)
- Configure HTTPS for development (self-signed certs)
- Setup MongoDB connection

---

## Phase 2: User Authentication System (Week 1-2)

### 2.1 Backend Authentication
**Files to create:**
- `server/models/User.js` - User schema
- `server/routes/auth.js` - Authentication routes
- `server/middleware/auth.js` - JWT verification middleware

**Implementation:**
1. **User Model (MongoDB Schema):**
   ```javascript
   {
     username: String (unique, required),
     passwordHash: String (required),
     salt: String (required),
     publicKey: String (required), // Base64 encoded
     createdAt: Date,
     lastLogin: Date
   }
   ```

2. **Password Security:**
   - Use `bcrypt` or `argon2` for hashing
   - Generate unique salt per user
   - Hash password: `bcrypt.hash(password, saltRounds)`
   - Store: `passwordHash` and `salt` in database

3. **API Endpoints:**
   - `POST /api/auth/register` - User registration
   - `POST /api/auth/login` - User login
   - `GET /api/auth/verify` - Verify JWT token
   - `POST /api/auth/logout` - Logout (optional)

4. **JWT Token:**
   - Generate JWT on successful login
   - Include: `userId`, `username`, `exp`
   - Return token to client for subsequent requests

### 2.2 Frontend Authentication
**Files to create:**
- `client/src/components/Login.js`
- `client/src/components/Register.js`
- `client/src/services/authService.js`
- `client/src/context/AuthContext.js`

**Implementation:**
1. **Registration Form:**
   - Username, password, confirm password
   - Client-side validation
   - Call `/api/auth/register`

2. **Login Form:**
   - Username, password
   - Store JWT in localStorage/sessionStorage
   - Redirect to main app on success

3. **Auth Context:**
   - Global state for authentication
   - Protected routes wrapper
   - Auto-logout on token expiry

### 2.3 Logging for Authentication
- Log all login attempts (success/failure)
- Log registration attempts
- Store in: `server/logs/auth.log`
- Include: timestamp, IP, username, result

---

## Phase 3: Key Generation & Secure Storage (Week 2)

### 3.1 Client-Side Key Generation
**Files to create:**
- `client/src/crypto/keyGeneration.js`
- `client/src/storage/keyStorage.js`

**Implementation:**
1. **Key Generation on Registration:**
   - Use Web Crypto API: `crypto.subtle.generateKey()`
   - Choose: **RSA-2048** OR **ECC P-256**
   - Generate key pair with:
     - `modulusLength: 2048` (RSA) OR
     - `namedCurve: 'P-256'` (ECC)
     - `publicKey`: Extract and send to server
     - `privateKey`: NEVER send to server

2. **Key Pair Structure:**
   ```javascript
   {
     publicKey: CryptoKey (export as Base64),
     privateKey: CryptoKey (keep in memory, store encrypted)
   }
   ```

3. **Send Public Key to Server:**
   - After registration, export public key
   - Send to: `POST /api/users/public-key`
   - Store in User model

### 3.2 Secure Key Storage (IndexedDB)
**Implementation:**
1. **IndexedDB Setup:**
   - Database name: `CipherlinkKeys`
   - Object store: `privateKeys`
   - Key: `userId`

2. **Store Private Key:**
   - Export private key as ArrayBuffer
   - Encrypt with user's password (AES-GCM)
   - Store encrypted key in IndexedDB
   - Never store plaintext private key

3. **Key Retrieval:**
   - Retrieve from IndexedDB
   - Decrypt with user's password
   - Import back to CryptoKey object
   - Use for cryptographic operations

4. **Key Storage Functions:**
   - `storePrivateKey(userId, privateKey, password)`
   - `getPrivateKey(userId, password)`
   - `deletePrivateKey(userId)` - on logout

### 3.3 Backend Public Key Storage
- Store public key in User model
- Endpoint: `GET /api/users/:userId/public-key`
- Return public key for key exchange

---

## Phase 4: Custom Key Exchange Protocol (Week 3-4)

### 4.1 Protocol Design
**Custom ECDH + Digital Signature Protocol:**

**Message Flow:**
1. **Initiation (Alice → Bob):**
   - Alice generates ECDH key pair (ephemeral)
   - Alice signs her public key with her private key
   - Send: `{ type: 'initiate', publicKey: alicePub, signature: sig, timestamp: ts }`

2. **Response (Bob → Alice):**
   - Bob generates ECDH key pair (ephemeral)
   - Bob derives shared secret
   - Bob signs his public key + Alice's public key
   - Send: `{ type: 'response', publicKey: bobPub, signature: sig, timestamp: ts }`

3. **Key Confirmation (Alice → Bob):**
   - Alice derives shared secret
   - Alice creates confirmation message
   - Encrypt confirmation with session key
   - Send: `{ type: 'confirm', encryptedConfirmation: data }`

4. **Session Key Derivation:**
   - Use HKDF or SHA-256
   - Input: shared secret + both public keys
   - Output: 256-bit session key

### 4.2 Implementation
**Files to create:**
- `client/src/crypto/keyExchange.js`
- `client/src/crypto/signatures.js`
- `server/routes/keyExchange.js`

**Client Functions:**
1. **Initiate Key Exchange:**
   ```javascript
   initiateKeyExchange(recipientId, myPrivateKey)
   ```

2. **Handle Key Exchange Response:**
   ```javascript
   handleKeyExchangeResponse(response, myPrivateKey)
   ```

3. **Derive Session Key:**
   ```javascript
   deriveSessionKey(sharedSecret, publicKey1, publicKey2)
   ```

4. **Key Confirmation:**
   ```javascript
   sendKeyConfirmation(sessionKey, recipientId)
   ```

**Backend:**
- Store key exchange requests temporarily
- Route messages between users
- Log all key exchange attempts
- Do NOT store private keys or session keys

### 4.3 Session Key Management
- Store session keys in memory (Map: `userId -> sessionKey`)
- Clear on logout or timeout
- One session key per conversation pair

---

## Phase 5: End-to-End Message Encryption (Week 4-5)

### 5.1 Message Encryption (Client-Side)
**Files to create:**
- `client/src/crypto/messageEncryption.js`

**Implementation:**
1. **Encrypt Message:**
   - Get session key for recipient
   - Generate random IV (12 bytes for AES-GCM)
   - Encrypt with AES-256-GCM:
     ```javascript
     crypto.subtle.encrypt(
       { name: 'AES-GCM', iv: iv },
       sessionKey,
       messageText
     )
     ```
   - Result: `{ ciphertext, iv, tag }`

2. **Message Structure:**
   ```javascript
   {
     senderId: String,
     recipientId: String,
     ciphertext: String (Base64),
     iv: String (Base64),
     tag: String (Base64),
     timestamp: Number,
     sequenceNumber: Number,
     nonce: String
   }
   ```

3. **Send to Server:**
   - POST to `/api/messages/send`
   - Server stores only encrypted data

### 5.2 Message Decryption (Client-Side)
**Implementation:**
1. **Receive Encrypted Message:**
   - Fetch from `/api/messages/:conversationId`
   - Get session key for sender
   - Decrypt with AES-256-GCM

2. **Decrypt Function:**
   ```javascript
   decryptMessage(encryptedMessage, sessionKey)
   ```

### 5.3 Backend Message Storage
**Files to create:**
- `server/models/Message.js`
- `server/routes/messages.js`

**Message Schema:**
```javascript
{
  senderId: ObjectId,
  recipientId: ObjectId,
  ciphertext: String,
  iv: String,
  tag: String,
  timestamp: Date,
  sequenceNumber: Number,
  nonce: String,
  createdAt: Date
}
```

**API Endpoints:**
- `POST /api/messages/send` - Send encrypted message
- `GET /api/messages/:conversationId` - Get messages (encrypted)
- `GET /api/messages/:messageId` - Get single message

**Important:** Server NEVER decrypts messages

---

## Phase 6: Replay Attack Protection (Week 5)

### 6.1 Replay Protection Components
**Files to create:**
- `client/src/crypto/replayProtection.js`
- `server/middleware/replayProtection.js`

**Implementation:**
1. **Nonce Generation:**
   - Generate unique nonce per message
   - Use: `crypto.getRandomValues()` (16 bytes)
   - Include in message structure

2. **Timestamp:**
   - Include server timestamp on message
   - Client includes client timestamp
   - Reject if difference > 5 minutes

3. **Sequence Numbers:**
   - Maintain counter per conversation
   - Increment for each sent message
   - Store in: `Map<conversationId, sequenceNumber>`
   - Reject if sequence number <= last received

4. **Server-Side Verification:**
   - Check nonce not seen before (store in cache)
   - Check timestamp is recent
   - Check sequence number is valid
   - Reject if any check fails

### 6.2 Replay Attack Detection
- Log all rejected messages
- Store in: `server/logs/replay.log`
- Include: timestamp, messageId, reason

### 6.3 Client-Side Replay Protection
- Store received nonces (last 1000)
- Check sequence numbers
- Reject duplicate messages

---

## Phase 7: Encrypted File Sharing (Week 6)

### 7.1 File Encryption (Client-Side)
**Files to create:**
- `client/src/crypto/fileEncryption.js`
- `client/src/services/fileService.js`

**Implementation:**
1. **File Chunking (Optional but Recommended):**
   - Split file into chunks (e.g., 1MB each)
   - Process chunks in parallel

2. **Encrypt Each Chunk:**
   - Generate IV per chunk
   - Encrypt with AES-256-GCM
   - Result: `{ ciphertext, iv, tag }`

3. **File Metadata:**
   ```javascript
   {
     fileName: String,
     fileSize: Number,
     mimeType: String,
     chunks: [
       { chunkIndex: Number, ciphertext: String, iv: String, tag: String }
     ],
     totalChunks: Number
   }
   ```

4. **Upload Encrypted File:**
   - POST to `/api/files/upload`
   - Send encrypted chunks + metadata

### 7.2 File Storage (Backend)
**Files to create:**
- `server/models/File.js`
- `server/routes/files.js`

**File Schema:**
```javascript
{
  senderId: ObjectId,
  recipientId: ObjectId,
  fileName: String,
  fileSize: Number,
  mimeType: String,
  chunks: [{
    chunkIndex: Number,
    ciphertext: String,
    iv: String,
    tag: String
  }],
  uploadedAt: Date
}
```

**API Endpoints:**
- `POST /api/files/upload` - Upload encrypted file
- `GET /api/files/:fileId` - Download encrypted file
- `GET /api/files/conversation/:conversationId` - List files

### 7.3 File Decryption (Client-Side)
**Implementation:**
1. **Download Encrypted File:**
   - GET from `/api/files/:fileId`
   - Receive encrypted chunks

2. **Decrypt Chunks:**
   - Decrypt each chunk with session key
   - Combine chunks in order
   - Create Blob and download

3. **Decrypt Function:**
   ```javascript
   decryptFile(encryptedFile, sessionKey)
   ```

---

## Phase 8: Real-Time Messaging (Optional - Week 6-7)

### 8.1 Socket.io Integration
**Files to create:**
- `server/socket/socketHandler.js`
- `client/src/services/socketService.js`

**Implementation:**
1. **Server Socket Setup:**
   - Initialize Socket.io
   - Authenticate with JWT
   - Handle connection/disconnection

2. **Real-Time Events:**
   - `message:send` - Send encrypted message
   - `message:receive` - Receive encrypted message
   - `typing:start` - User typing
   - `typing:stop` - User stopped typing

3. **Client Socket:**
   - Connect on login
   - Listen for new messages
   - Emit message events

**Note:** All messages still encrypted before sending

---

## Phase 9: Logging & Security Auditing (Week 7)

### 9.1 Comprehensive Logging
**Files to create:**
- `server/utils/logger.js`
- `server/middleware/auditLogger.js`

**Log Categories:**
1. **Authentication Logs:**
   - Login attempts (success/failure)
   - Registration attempts
   - Token validation

2. **Key Exchange Logs:**
   - Key exchange initiation
   - Key exchange completion
   - Key exchange failures

3. **Message Logs:**
   - Failed decryptions
   - Invalid message format
   - Message delivery status

4. **Security Event Logs:**
   - Replay attack detections
   - Invalid signatures
   - Suspicious activity

5. **Access Logs:**
   - API endpoint access
   - File access
   - Metadata queries

### 9.2 Log Format
```javascript
{
  timestamp: Date,
  eventType: String,
  userId: String,
  ipAddress: String,
  details: Object,
  severity: String // 'info', 'warning', 'error', 'critical'
}
```

### 9.3 Log Storage
- Store in: `server/logs/`
- Files: `auth.log`, `keyExchange.log`, `security.log`, `access.log`
- Rotate logs daily
- Include in project report

---

## Phase 10: Attack Demonstrations (Week 8)

### 10.1 MITM Attack Script
**Files to create:**
- `tests/mitm-attack.js`
- `tests/mitm-without-signatures.js`

**Implementation:**
1. **MITM Without Signatures:**
   - Intercept key exchange messages
   - Replace public keys with attacker's keys
   - Demonstrate successful MITM
   - Show how messages can be decrypted

2. **MITM With Signatures:**
   - Attempt same attack
   - Show signature verification fails
   - Demonstrate prevention

3. **Documentation:**
   - Screenshots of attack
   - Wireshark packet captures
   - Explanation in report

### 10.2 Replay Attack Script
**Files to create:**
- `tests/replay-attack.js`

**Implementation:**
1. **Capture Message:**
   - Intercept encrypted message
   - Store message data

2. **Replay Message:**
   - Send same message again
   - Show detection and rejection
   - Log rejection

3. **Documentation:**
   - Screenshots
   - Logs showing rejection
   - Explanation

### 10.3 BurpSuite Testing
- Setup BurpSuite proxy
- Intercept HTTPS traffic
- Show encrypted payloads
- Demonstrate server cannot decrypt
- Screenshots for report

---

## Phase 11: Frontend UI Development (Week 8-9)

### 11.1 Main Components
**Files to create:**
- `client/src/components/Chat.js` - Main chat interface
- `client/src/components/MessageList.js` - Message display
- `client/src/components/MessageInput.js` - Message input
- `client/src/components/FileUpload.js` - File upload
- `client/src/components/ConversationList.js` - User list
- `client/src/components/KeyExchangeStatus.js` - Key exchange UI

### 11.2 UI Features
- User registration/login
- Conversation list
- Chat interface
- File upload/download
- Key exchange status indicator
- Error handling UI
- Loading states

### 11.3 Styling
- Basic CSS or styled-components
- Responsive design
- Clean, functional UI (no fancy templates)

---

## Phase 12: Testing & Bug Fixes (Week 9-10)

### 12.1 Functional Testing
- Test user registration/login
- Test key generation and storage
- Test key exchange protocol
- Test message encryption/decryption
- Test file encryption/decryption
- Test replay protection
- Test error handling

### 12.2 Security Testing
- Verify no plaintext on server
- Verify private keys never sent
- Test replay attack prevention
- Test signature verification
- Verify HTTPS usage

### 12.3 Integration Testing
- End-to-end message flow
- File sharing flow
- Multiple users
- Concurrent connections

---

## Phase 13: Documentation & Report (Week 10-11)

### 13.1 Code Documentation
- Add JSDoc comments
- Document cryptographic functions
- Document API endpoints
- Document key exchange protocol

### 13.2 Project Report Sections
1. **Introduction**
2. **Problem Statement**
3. **System Architecture**
   - High-level diagram
   - Component diagrams
   - Database schema
4. **Threat Model (STRIDE)**
   - Spoofing
   - Tampering
   - Repudiation
   - Information Disclosure
   - Denial of Service
   - Elevation of Privilege
5. **Cryptographic Design**
   - Key generation
   - Key exchange protocol (with diagrams)
   - Encryption/decryption workflows
6. **Attack Demonstrations**
   - MITM attack
   - Replay attack
   - Prevention mechanisms
7. **Logs and Evidence**
   - Security audit logs
   - Attack logs
   - Wireshark captures
8. **Evaluation and Conclusion**

### 13.3 README.md
- Project description
- Setup instructions
- Installation steps
- Configuration
- Usage guide
- API documentation

---

## Phase 14: Video Demonstration (Week 11)

### 14.1 Video Content (10-15 minutes)
1. **Introduction** (1 min)
2. **Protocol Explanation** (3 min)
   - Key exchange protocol
   - Encryption process
3. **Working Demo** (5 min)
   - User registration
   - Key exchange
   - Encrypted messaging
   - File sharing
4. **Attack Demonstrations** (4 min)
   - MITM attack
   - Replay attack
   - Prevention
5. **Limitations & Improvements** (2 min)

---

## Technical Implementation Details

### Cryptographic Choices
- **Asymmetric:** RSA-2048 OR ECC P-256
- **Symmetric:** AES-256-GCM
- **Key Derivation:** HKDF or SHA-256
- **Hashing:** bcrypt or argon2
- **Signatures:** RSA-PSS or ECDSA

### Security Best Practices
- All encryption client-side
- Private keys never leave client
- HTTPS for all communication
- Fresh IV per message
- Timestamp validation
- Sequence number tracking
- Nonce uniqueness

### Database Schema Summary
1. **Users Collection:**
   - username, passwordHash, salt, publicKey, createdAt

2. **Messages Collection:**
   - senderId, recipientId, ciphertext, iv, tag, timestamp, sequenceNumber, nonce

3. **Files Collection:**
   - senderId, recipientId, fileName, fileSize, mimeType, chunks, uploadedAt

4. **Sessions Collection (Optional):**
   - userId, sessionKey (encrypted), expiresAt

---

## Development Timeline

**Week 1:** Setup + Authentication
**Week 2:** Key Generation + Storage
**Week 3-4:** Key Exchange Protocol
**Week 4-5:** Message Encryption
**Week 5:** Replay Protection
**Week 6:** File Sharing
**Week 6-7:** Real-time (Optional)
**Week 7:** Logging
**Week 8:** Attack Scripts
**Week 8-9:** UI Development
**Week 9-10:** Testing
**Week 10-11:** Documentation
**Week 11:** Video

---

## Critical Reminders

1. ✅ Use only Web Crypto API (client) and Node crypto (server)
2. ✅ No third-party crypto libraries
3. ✅ All encryption client-side
4. ✅ Private keys NEVER on server
5. ✅ Implement 70%+ of crypto logic yourself
6. ✅ HTTPS mandatory
7. ✅ AES-GCM only
8. ✅ Unique protocol variant
9. ✅ Comprehensive logging
10. ✅ Attack demonstrations required

---

## Next Steps

1. Review this plan with your team
2. Assign tasks to team members
3. Set up project structure
4. Begin Phase 1: Project Setup
5. Create GitHub private repository
6. Start development following phases

Good luck with your project! 🚀



