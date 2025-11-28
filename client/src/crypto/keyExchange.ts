export interface KeyExchangeMessage {
  type: 'initiate' | 'response' | 'confirm'
  fromUserId: string
  toUserId: string
  publicKey: string
  signature?: string
  timestamp: number
  confirmationHash?: string
}

export interface SessionKey {
  key: CryptoKey
  userId: string
  establishedAt: number
}

const sessionKeys = new Map<string, SessionKey>()
const ecdhKeyPairs = new Map<string, { keyPair: CryptoKeyPair; exchangeId: string; createdAt: number }>()

export async function initiateKeyExchange(
  recipientId: string,
  recipientPublicKey: string,
  myPrivateKey: CryptoKey,
  myUserId: string
): Promise<KeyExchangeMessage> {
  const ecdhKeyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  )

  const publicKeyBuffer = await crypto.subtle.exportKey('spki', ecdhKeyPair.publicKey)
  const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)))

  const message: KeyExchangeMessage = {
    type: 'initiate',
    fromUserId: myUserId,
    toUserId: recipientId,
    publicKey: publicKeyBase64,
    timestamp: Date.now(),
  }

  const messageData = JSON.stringify({
    type: message.type,
    fromUserId: message.fromUserId,
    toUserId: message.toUserId,
    publicKey: message.publicKey,
    timestamp: message.timestamp,
  })

  const encoder = new TextEncoder()
  const messageBytes = encoder.encode(messageData)

  const signature = await crypto.subtle.sign(
    {
      name: 'RSA-PSS',
      saltLength: 32,
    },
    myPrivateKey,
    messageBytes
  )

  message.signature = btoa(String.fromCharCode(...new Uint8Array(signature)))

  return message
}

export async function handleKeyExchangeResponse(
  response: KeyExchangeMessage,
  myPrivateKey: CryptoKey,
  senderPublicKey: CryptoKey,
  myEcdhPrivateKey: CryptoKey
): Promise<CryptoKey> {
  const messageData = JSON.stringify({
    type: response.type,
    fromUserId: response.fromUserId,
    toUserId: response.toUserId,
    publicKey: response.publicKey,
    timestamp: response.timestamp,
  })

  console.log('[KEY EXCHANGE] Verifying signature for message:', messageData)

  const encoder = new TextEncoder()
  const messageBytes = encoder.encode(messageData)

  if (response.signature) {
    const signatureBytes = Uint8Array.from(atob(response.signature), c => c.charCodeAt(0))
    console.log('[KEY EXCHANGE] Signature bytes length:', signatureBytes.length)
    
    try {
      const isValid = await crypto.subtle.verify(
        {
          name: 'RSA-PSS',
          saltLength: 32,
        },
        senderPublicKey,
        signatureBytes,
        messageBytes
      )

      if (!isValid) {
        console.error('[KEY EXCHANGE] Signature verification returned false')
        console.error('[KEY EXCHANGE] Message data:', messageData)
        console.error('[KEY EXCHANGE] From user:', response.fromUserId)
        console.error('[KEY EXCHANGE] To user:', response.toUserId)
        throw new Error('Invalid signature in key exchange response')
      }
      console.log('[KEY EXCHANGE] Signature verified successfully')
    } catch (verifyError: any) {
      console.error('[KEY EXCHANGE] Signature verification error:', verifyError)
      throw new Error(`Signature verification failed: ${verifyError.message}`)
    }
  }

  const senderEcdhPublicKeyBuffer = Uint8Array.from(atob(response.publicKey), c => c.charCodeAt(0))
  const senderEcdhPublicKey = await crypto.subtle.importKey(
    'spki',
    senderEcdhPublicKeyBuffer,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    false,
    []
  )

  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: senderEcdhPublicKey,
    },
    myEcdhPrivateKey,
    256
  )

  // Pass both user IDs to ensure both users derive the same session key
  const sessionKey = await deriveSessionKey(
    sharedSecret, 
    response.publicKey, 
    response.toUserId, // myUserId (the one receiving the response)
    response.fromUserId // otherUserId (the one who sent the response)
  )
  return sessionKey
}

export async function deriveSessionKey(
  sharedSecret: ArrayBuffer,
  otherPublicKey: string,
  myUserId: string,
  otherUserId?: string
): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  
  // Both users must derive the same key, so we ONLY use sorted user IDs
  // We do NOT include the ECDH public key because it's different for each exchange direction
  // Both users derive from the same shared secret (ECDH is commutative), so using only
  // sorted user IDs ensures they get the same session key
  let info: Uint8Array
  if (otherUserId) {
    const sortedIds = [myUserId, otherUserId].sort()
    // Only use sorted user IDs - no ECDH public key to ensure consistency
    const infoString = `Cipherlink-Session-Key-${sortedIds[0]}-${sortedIds[1]}`
    info = encoder.encode(infoString)
    console.log('[KEY EXCHANGE] Deriving session key with:', {
      myUserId,
      otherUserId,
      sortedIds,
      infoString,
      sharedSecretLength: sharedSecret.byteLength
    })
  } else {
    // Fallback: should not happen, but use a deterministic format
    console.warn('[KEY EXCHANGE] deriveSessionKey called without otherUserId, using fallback')
    info = encoder.encode(`Cipherlink-Session-Key-${myUserId}`)
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    'HKDF',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: new Uint8Array(32),
      info: info,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function sendKeyConfirmation(
  sessionKey: CryptoKey,
  recipientId: string,
  myUserId: string
): Promise<KeyExchangeMessage> {
  const confirmation = `KEY-CONFIRMED-${myUserId}-${recipientId}-${Date.now()}`
  const encoder = new TextEncoder()
  const confirmationBytes = encoder.encode(confirmation)

  const hashBuffer = await crypto.subtle.digest('SHA-256', confirmationBytes)
  const hashArray = new Uint8Array(hashBuffer)
  const confirmationHash = btoa(String.fromCharCode(...hashArray))

  return {
    type: 'confirm',
    fromUserId: myUserId,
    toUserId: recipientId,
    publicKey: '',
    timestamp: Date.now(),
    confirmationHash,
  }
}

export function storeSessionKey(userId: string, key: CryptoKey): void {
  sessionKeys.set(userId, {
    key,
    userId,
    establishedAt: Date.now(),
  })
}

export function getSessionKey(userId: string): CryptoKey | null {
  const session = sessionKeys.get(userId)
  if (!session) return null

  const oneHour = 60 * 60 * 1000
  if (Date.now() - session.establishedAt > oneHour) {
    sessionKeys.delete(userId)
    return null
  }

  return session.key
}

export function clearSessionKey(userId: string): void {
  sessionKeys.delete(userId)
}

export function storeEcdhKeyPair(exchangeId: string, keyPair: CryptoKeyPair): void {
  ecdhKeyPairs.set(exchangeId, {
    keyPair,
    exchangeId,
    createdAt: Date.now(),
  })
  
  // Clean up after 10 minutes
  setTimeout(() => {
    ecdhKeyPairs.delete(exchangeId)
  }, 10 * 60 * 1000)
}

export function getEcdhKeyPair(exchangeId: string): CryptoKeyPair | null {
  const stored = ecdhKeyPairs.get(exchangeId)
  if (!stored) return null
  
  const tenMinutes = 10 * 60 * 1000
  if (Date.now() - stored.createdAt > tenMinutes) {
    ecdhKeyPairs.delete(exchangeId)
    return null
  }
  
  return stored.keyPair
}

export function clearEcdhKeyPair(exchangeId: string): void {
  ecdhKeyPairs.delete(exchangeId)
}

