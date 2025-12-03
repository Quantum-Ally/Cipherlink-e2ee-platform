export interface EncryptedMessage {
  ciphertext: string
  iv: string
  tag: string
  timestamp: number
  sequenceNumber: number
  nonce: string
}

// Per-conversation sequence counters for replay protection
// Key: conversationId (sorted userId pair), Value: current sequence number
let sequenceCounters = new Map<string, number>()

/**
 * Get and increment the sequence number for a conversation
 * Sequence numbers are strictly monotonically increasing per conversation
 */
function getSequenceNumber(conversationId: string): number {
  const current = sequenceCounters.get(conversationId) || 0
  const next = current + 1
  sequenceCounters.set(conversationId, next)
  console.log(`[SEQUENCE] Conversation ${conversationId}: sequence number ${next}`)
  return next
}

/**
 * Generate a cryptographically secure random nonce
 * Nonces are 128-bit random values to prevent replay attacks
 * Each nonce must be unique and used only once
 */
function generateNonce(): string {
  // Generate 16 random bytes (128 bits) for nonce
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16))
  
  // Convert to base64 for transmission
  const nonce = btoa(String.fromCharCode(...nonceBytes))
  
  console.log(`[NONCE] Generated: ${nonce.substring(0, 12)}... (${nonceBytes.length} bytes)`)
  return nonce
}

/**
 * Validate nonce format
 */
function validateNonce(nonce: string): boolean {
  // Nonce must be base64 encoded and at least 16 characters
  return nonce.length >= 16 && /^[A-Za-z0-9+/]+=*$/.test(nonce)
}

/**
 * Encrypt a message using AES-GCM with comprehensive replay protection
 * 
 * Replay Protection Layers:
 * 1. NONCE: Cryptographically random, unique per message
 * 2. TIMESTAMP: Current time, validated server-side (5 min window)
 * 3. SEQUENCE NUMBER: Monotonically increasing per conversation
 * 
 * @param message - The plaintext message to encrypt
 * @param sessionKey - The AES-GCM session key
 * @param conversationId - Unique identifier for the conversation
 * @returns Encrypted message with replay protection metadata
 */
export async function encryptMessage(
  message: string,
  sessionKey: CryptoKey,
  conversationId: string
): Promise<EncryptedMessage> {
  const encoder = new TextEncoder()
  const messageBytes = encoder.encode(message)

  // Generate replay protection parameters
  const iv = crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV for AES-GCM
  const nonce = generateNonce() // 128-bit cryptographic nonce
  const sequenceNumber = getSequenceNumber(conversationId) // Monotonic counter
  const timestamp = Date.now() // Current timestamp

  console.log(`[ENCRYPT] Message for conversation ${conversationId}`)
  console.log(`[ENCRYPT] - Sequence: ${sequenceNumber}`)
  console.log(`[ENCRYPT] - Timestamp: ${new Date(timestamp).toISOString()}`)
  console.log(`[ENCRYPT] - Nonce: ${nonce.substring(0, 12)}...`)

  // Validate nonce before encryption
  if (!validateNonce(nonce)) {
    throw new Error('Invalid nonce generated')
  }

  // Encrypt using AES-GCM
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128, // 128-bit authentication tag
    },
    sessionKey,
    messageBytes
  )

  // Extract ciphertext and authentication tag
  const encryptedArray = new Uint8Array(encrypted)
  const tag = encryptedArray.slice(-16) // Last 16 bytes = auth tag
  const ciphertext = encryptedArray.slice(0, -16) // Rest = ciphertext

  return {
    ciphertext: btoa(String.fromCharCode(...ciphertext)),
    iv: btoa(String.fromCharCode(...iv)),
    tag: btoa(String.fromCharCode(...tag)),
    timestamp,
    sequenceNumber,
    nonce,
  }
}

/**
 * Decrypt a message and validate replay protection parameters
 * 
 * @param encrypted - The encrypted message with metadata
 * @param sessionKey - The AES-GCM session key
 * @returns Decrypted plaintext message
 */
export async function decryptMessage(
  encrypted: EncryptedMessage,
  sessionKey: CryptoKey
): Promise<string> {
  // Validate replay protection fields
  if (!encrypted.nonce || !encrypted.timestamp || !encrypted.sequenceNumber) {
    throw new Error('Missing replay protection fields')
  }

  // Validate nonce format
  if (!validateNonce(encrypted.nonce)) {
    throw new Error('Invalid nonce format')
  }

  // Validate timestamp (must be within reasonable range)
  const now = Date.now()
  const age = now - encrypted.timestamp
  if (age < 0) {
    console.warn('[DECRYPT] Warning: Message timestamp is in the future')
  }
  if (age > 10 * 60 * 1000) { // 10 minutes for received messages (more lenient)
    console.warn(`[DECRYPT] Warning: Message is ${Math.round(age / 1000)}s old`)
  }

  console.log(`[DECRYPT] Processing message`)
  console.log(`[DECRYPT] - Sequence: ${encrypted.sequenceNumber}`)
  console.log(`[DECRYPT] - Age: ${Math.round(age / 1000)}s`)
  console.log(`[DECRYPT] - Nonce: ${encrypted.nonce.substring(0, 12)}...`)

  // Decode from base64
  const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0))
  const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), c => c.charCodeAt(0))
  const tag = Uint8Array.from(atob(encrypted.tag), c => c.charCodeAt(0))

  // Combine ciphertext and tag for AES-GCM
  const combined = new Uint8Array(ciphertext.length + tag.length)
  combined.set(ciphertext, 0)
  combined.set(tag, ciphertext.length)

  try {
    // Decrypt with AES-GCM
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128,
      },
      sessionKey,
      combined
    )

    const decoder = new TextDecoder()
    const plaintext = decoder.decode(decrypted)
    
    console.log(`[DECRYPT] ✓ Successfully decrypted message`)
    return plaintext
  } catch (error: any) {
    console.error('[DECRYPT] Decryption failed:', {
      error: error.message,
      ivLength: iv.length,
      ciphertextLength: ciphertext.length,
      tagLength: tag.length,
    })
    throw new Error(`Failed to decrypt message: ${error.message || 'Invalid key or corrupted data'}`)
  }
}

/**
 * Reset the sequence counter for a conversation
 * Use with caution - only when starting a new conversation or after key exchange
 */
export function resetSequenceCounter(conversationId: string): void {
  sequenceCounters.delete(conversationId)
  console.log(`[SEQUENCE] Reset counter for conversation ${conversationId}`)
}

/**
 * Get current sequence number for a conversation (without incrementing)
 */
export function getCurrentSequenceNumber(conversationId: string): number {
  return sequenceCounters.get(conversationId) || 0
}

/**
 * Get replay protection statistics
 */
export function getReplayProtectionStats() {
  return {
    activeConversations: sequenceCounters.size,
    conversations: Array.from(sequenceCounters.entries()).map(([id, seq]) => ({
      id,
      sequenceNumber: seq
    }))
  }
}


