const DB_NAME = 'CipherlinkKeys'
const DB_VERSION = 3
const STORE_NAME = 'privateKeys'
const ECDH_STORE_NAME = 'ecdhKeyPairs'
const SESSION_KEYS_STORE_NAME = 'sessionKeys'

export interface StoredKey {
  userId: string
  encryptedKey: string
  salt: string
}

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' })
      }
      if (!db.objectStoreNames.contains(ECDH_STORE_NAME)) {
        db.createObjectStore(ECDH_STORE_NAME, { keyPath: 'exchangeId' })
      }
      if (!db.objectStoreNames.contains(SESSION_KEYS_STORE_NAME)) {
        db.createObjectStore(SESSION_KEYS_STORE_NAME, { keyPath: 'userId' })
      }
    }
  })
}

async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function storePrivateKey(
  userId: string,
  privateKey: CryptoKey,
  password: string
): Promise<void> {
  const db = await openDB()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derivedKey = await deriveKeyFromPassword(password, salt)

  const exportedKey = await crypto.subtle.exportKey('pkcs8', privateKey)
  const keyData = new Uint8Array(exportedKey)

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    derivedKey,
    keyData
    )

  const encryptedArray = new Uint8Array(encrypted)
  const combined = new Uint8Array(iv.length + encryptedArray.length)
  combined.set(iv, 0)
  combined.set(encryptedArray, iv.length)

  const stored: StoredKey = {
    userId,
    encryptedKey: btoa(String.fromCharCode(...combined)),
    salt: btoa(String.fromCharCode(...salt)),
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(stored)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function getPrivateKey(
  userId: string,
  password: string
): Promise<CryptoKey | null> {
  try {
    const db = await openDB()
    const stored = await new Promise<StoredKey | undefined>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(userId)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    if (!stored) return null

    const salt = Uint8Array.from(atob(stored.salt), c => c.charCodeAt(0))
    const derivedKey = await deriveKeyFromPassword(password, salt)

    const combined = Uint8Array.from(atob(stored.encryptedKey), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const encrypted = combined.slice(12)

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      derivedKey,
      encrypted
    )

    const keyData = new Uint8Array(decrypted)
    
    try {
      return await crypto.subtle.importKey(
        'pkcs8',
        keyData,
        {
          name: 'RSA-PSS',
          hash: 'SHA-256',
        },
        false,
        ['sign']
      )
    } catch (pssError) {
      console.warn('Failed to import as RSA-PSS, trying RSA-OAEP (old format):', pssError)
      try {
        const oldKey = await crypto.subtle.importKey(
          'pkcs8',
          keyData,
          {
            name: 'RSA-OAEP',
            hash: 'SHA-256',
          },
          false,
          ['decrypt']
        )
        console.error('Key is in old RSA-OAEP format. Please re-register your account to use RSA-PSS keys.')
        return null
      } catch (oaepError) {
        console.error('Failed to import key in both formats:', oaepError)
        throw oaepError
      }
    }
  } catch (error) {
    console.error('Failed to retrieve private key:', error)
    return null
  }
}

export async function deletePrivateKey(userId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(userId)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export interface StoredEcdhKeyPair {
  exchangeId: string
  encryptedPrivateKey: string
  publicKey: string
  salt: string
  createdAt: number
}

export async function storeEcdhKeyPairPersistent(
  exchangeId: string,
  keyPair: CryptoKeyPair,
  password: string
): Promise<void> {
  const db = await openDB()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derivedKey = await deriveKeyFromPassword(password, salt)

  const exportedPrivateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  const privateKeyData = new Uint8Array(exportedPrivateKey)

  const exportedPublicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey)
  const publicKeyData = new Uint8Array(exportedPublicKey)

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    derivedKey,
    privateKeyData
  )

  const encryptedArray = new Uint8Array(encrypted)
  const combined = new Uint8Array(iv.length + encryptedArray.length)
  combined.set(iv, 0)
  combined.set(encryptedArray, iv.length)

  const stored: StoredEcdhKeyPair = {
    exchangeId,
    encryptedPrivateKey: btoa(String.fromCharCode(...combined)),
    publicKey: btoa(String.fromCharCode(...publicKeyData)),
    salt: btoa(String.fromCharCode(...salt)),
    createdAt: Date.now(),
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ECDH_STORE_NAME], 'readwrite')
    const store = transaction.objectStore(ECDH_STORE_NAME)
    const request = store.put(stored)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function getEcdhKeyPairPersistent(
  exchangeId: string,
  password: string
): Promise<CryptoKeyPair | null> {
  try {
    const db = await openDB()
    const stored = await new Promise<StoredEcdhKeyPair | undefined>((resolve, reject) => {
      const transaction = db.transaction([ECDH_STORE_NAME], 'readonly')
      const store = transaction.objectStore(ECDH_STORE_NAME)
      const request = store.get(exchangeId)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    if (!stored) return null

    // Check if expired (10 minutes)
    const tenMinutes = 10 * 60 * 1000
    if (Date.now() - stored.createdAt > tenMinutes) {
      // Clean up expired key pair
      const deleteTransaction = db.transaction([ECDH_STORE_NAME], 'readwrite')
      const deleteStore = deleteTransaction.objectStore(ECDH_STORE_NAME)
      deleteStore.delete(exchangeId)
      return null
    }

    const salt = Uint8Array.from(atob(stored.salt), c => c.charCodeAt(0))
    const derivedKey = await deriveKeyFromPassword(password, salt)

    const combined = Uint8Array.from(atob(stored.encryptedPrivateKey), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const encrypted = combined.slice(12)

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      derivedKey,
      encrypted
    )

    const privateKeyData = new Uint8Array(decrypted)
    const publicKeyData = Uint8Array.from(atob(stored.publicKey), c => c.charCodeAt(0))

    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyData,
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      false,
      ['deriveKey', 'deriveBits']
    )

    const publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyData,
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      []
    )

    return { privateKey, publicKey }
  } catch (error) {
    console.error('Failed to retrieve ECDH key pair:', error)
    return null
  }
}

export async function deleteEcdhKeyPairPersistent(exchangeId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ECDH_STORE_NAME], 'readwrite')
    const store = transaction.objectStore(ECDH_STORE_NAME)
    const request = store.delete(exchangeId)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export interface StoredSessionKey {
  userId: string
  encryptedKey: string
  salt: string
  establishedAt: number
}

export async function storeSessionKeyPersistent(
  userId: string,
  sessionKey: CryptoKey,
  password: string
): Promise<void> {
  const db = await openDB()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derivedKey = await deriveKeyFromPassword(password, salt)

  const exportedKey = await crypto.subtle.exportKey('raw', sessionKey)
  const keyData = new Uint8Array(exportedKey)

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    derivedKey,
    keyData
  )

  const encryptedArray = new Uint8Array(encrypted)
  const combined = new Uint8Array(iv.length + encryptedArray.length)
  combined.set(iv, 0)
  combined.set(encryptedArray, iv.length)

  const stored: StoredSessionKey = {
    userId,
    encryptedKey: btoa(String.fromCharCode(...combined)),
    salt: btoa(String.fromCharCode(...salt)),
    establishedAt: Date.now(),
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_KEYS_STORE_NAME], 'readwrite')
    const store = transaction.objectStore(SESSION_KEYS_STORE_NAME)
    const request = store.put(stored)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function getSessionKeyPersistent(
  userId: string,
  password: string
): Promise<CryptoKey | null> {
  try {
    const db = await openDB()
    const stored = await new Promise<StoredSessionKey | undefined>((resolve, reject) => {
      const transaction = db.transaction([SESSION_KEYS_STORE_NAME], 'readonly')
      const store = transaction.objectStore(SESSION_KEYS_STORE_NAME)
      const request = store.get(userId)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    if (!stored) return null

    // Check if expired (1 hour)
    const oneHour = 60 * 60 * 1000
    if (Date.now() - stored.establishedAt > oneHour) {
      // Clean up expired session key
      const deleteTransaction = db.transaction([SESSION_KEYS_STORE_NAME], 'readwrite')
      const deleteStore = deleteTransaction.objectStore(SESSION_KEYS_STORE_NAME)
      deleteStore.delete(userId)
      return null
    }

    const salt = Uint8Array.from(atob(stored.salt), c => c.charCodeAt(0))
    const derivedKey = await deriveKeyFromPassword(password, salt)

    const combined = Uint8Array.from(atob(stored.encryptedKey), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const encrypted = combined.slice(12)

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      derivedKey,
      encrypted
    )

    const keyData = new Uint8Array(decrypted)

    return await crypto.subtle.importKey(
      'raw',
      keyData,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt']
    )
  } catch (error) {
    console.error('Failed to retrieve session key:', error)
    return null
  }
}

export async function deleteSessionKeyPersistent(userId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_KEYS_STORE_NAME], 'readwrite')
    const store = transaction.objectStore(SESSION_KEYS_STORE_NAME)
    const request = store.delete(userId)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

