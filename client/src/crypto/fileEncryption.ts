export interface EncryptedFileChunk {
  chunkIndex: number
  ciphertext: string
  iv: string
  tag: string
}

export interface EncryptedFile {
  fileName: string
  fileSize: number
  mimeType: string
  chunks: EncryptedFileChunk[]
  totalChunks: number
}

const CHUNK_SIZE = 1024 * 1024

export async function encryptFile(
  file: File,
  sessionKey: CryptoKey
): Promise<EncryptedFile> {
  const fileBuffer = await file.arrayBuffer()
  const chunks: EncryptedFileChunk[] = []
  const totalChunks = Math.ceil(fileBuffer.byteLength / CHUNK_SIZE)

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, fileBuffer.byteLength)
    const chunk = fileBuffer.slice(start, end)

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128,
      },
      sessionKey,
      chunk
    )

    const encryptedArray = new Uint8Array(encrypted)
    const tag = encryptedArray.slice(-16)
    const ciphertext = encryptedArray.slice(0, -16)

    chunks.push({
      chunkIndex: i,
      ciphertext: btoa(String.fromCharCode(...ciphertext)),
      iv: btoa(String.fromCharCode(...iv)),
      tag: btoa(String.fromCharCode(...tag)),
    })
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    chunks,
    totalChunks,
  }
}

export async function decryptFile(
  encryptedFile: EncryptedFile,
  sessionKey: CryptoKey
): Promise<Blob> {
  const decryptedChunks: Uint8Array[] = []

  for (const chunk of encryptedFile.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex)) {
    const iv = Uint8Array.from(atob(chunk.iv), c => c.charCodeAt(0))
    const ciphertext = Uint8Array.from(atob(chunk.ciphertext), c => c.charCodeAt(0))
    const tag = Uint8Array.from(atob(chunk.tag), c => c.charCodeAt(0))

    const combined = new Uint8Array(ciphertext.length + tag.length)
    combined.set(ciphertext, 0)
    combined.set(tag, ciphertext.length)

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128,
      },
      sessionKey,
      combined
    )

    decryptedChunks.push(new Uint8Array(decrypted))
  }

  const totalLength = decryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of decryptedChunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  return new Blob([result], { type: encryptedFile.mimeType })
}


