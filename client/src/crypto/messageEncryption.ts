export interface EncryptedMessage {
  ciphertext: string
  iv: string
  tag: string
  timestamp: number
  sequenceNumber: number
  nonce: string
}

let sequenceCounters = new Map<string, number>()

function getSequenceNumber(conversationId: string): number {
  const current = sequenceCounters.get(conversationId) || 0
  const next = current + 1
  sequenceCounters.set(conversationId, next)
  return next
}

function generateNonce(): string {
  const nonce = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...nonce))
}

export async function encryptMessage(
  message: string,
  sessionKey: CryptoKey,
  conversationId: string
): Promise<EncryptedMessage> {
  const encoder = new TextEncoder()
  const messageBytes = encoder.encode(message)

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const nonce = generateNonce()
  const sequenceNumber = getSequenceNumber(conversationId)

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128,
    },
    sessionKey,
    messageBytes
  )

  const encryptedArray = new Uint8Array(encrypted)
  const tag = encryptedArray.slice(-16)
  const ciphertext = encryptedArray.slice(0, -16)

  return {
    ciphertext: btoa(String.fromCharCode(...ciphertext)),
    iv: btoa(String.fromCharCode(...iv)),
    tag: btoa(String.fromCharCode(...tag)),
    timestamp: Date.now(),
    sequenceNumber,
    nonce,
  }
}

export async function decryptMessage(
  encrypted: EncryptedMessage,
  sessionKey: CryptoKey
): Promise<string> {
  const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0))
  const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), c => c.charCodeAt(0))
  const tag = Uint8Array.from(atob(encrypted.tag), c => c.charCodeAt(0))

  const combined = new Uint8Array(ciphertext.length + tag.length)
  combined.set(ciphertext, 0)
  combined.set(tag, ciphertext.length)

  try {
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
    return decoder.decode(decrypted)
  } catch (error: any) {
    console.error('[MESSAGE] Decryption error details:', {
      error: error.message,
      ivLength: iv.length,
      ciphertextLength: ciphertext.length,
      tagLength: tag.length,
    })
    throw new Error(`Failed to decrypt message: ${error.message || 'Invalid key or corrupted data'}`)
  }
}

export function resetSequenceCounter(conversationId: string): void {
  sequenceCounters.delete(conversationId)
}


