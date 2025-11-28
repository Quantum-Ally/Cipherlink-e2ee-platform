import { useState, useEffect } from 'react'
import { Message } from '@/services/messageService'
import { decryptMessage } from '@/crypto/messageEncryption'
import { getSessionKey, storeSessionKey } from '@/crypto/keyExchange'
import { getSessionKeyPersistent } from '@/storage/keyStorage'

interface MessageListProps {
  messages: Message[]
  currentUserId: string
  conversationId: string
}

export const MessageList = ({ messages, currentUserId, conversationId }: MessageListProps) => {
  const [decryptedMessages, setDecryptedMessages] = useState<{ [key: string]: string }>({})

  useEffect(() => {
    const decryptAll = async () => {
      if (messages.length === 0) {
        setDecryptedMessages({})
        return
      }

      const decrypted: { [key: string]: string } = {}
      for (const msg of messages) {
        const isOwn = msg.senderId === currentUserId
        // Session key is stored with the conversation partner's ID
        const partnerId = isOwn ? msg.recipientId : msg.senderId
        let sessionKey = getSessionKey(partnerId)
        
        // If not in memory, try IndexedDB (but don't prompt - just try to decrypt)
        // We'll only prompt when user tries to send a message
        if (!sessionKey) {
          // Silently try to get from IndexedDB if available
          // This is a best-effort attempt without prompting
        }
        
        console.log(`[MESSAGE] Decrypting message ${msg._id}:`, {
          isOwn,
          senderId: msg.senderId,
          recipientId: msg.recipientId,
          currentUserId,
          partnerId,
          hasSessionKey: !!sessionKey,
          messageTimestamp: new Date(msg.timestamp).toISOString(),
        })
        
        if (sessionKey) {
          try {
            const decryptedText = await decryptMessage(
              {
                ciphertext: msg.ciphertext,
                iv: msg.iv,
                tag: msg.tag,
                timestamp: new Date(msg.timestamp).getTime(),
                sequenceNumber: msg.sequenceNumber,
                nonce: msg.nonce,
              },
              sessionKey
            )
            decrypted[msg._id] = decryptedText
            console.log(`[MESSAGE] Successfully decrypted message ${msg._id}`)
          } catch (error: any) {
            console.error(`[MESSAGE] Failed to decrypt message ${msg._id}:`, error)
            // Check if this is a key mismatch (some messages decrypt, this one doesn't)
            // This means the message was encrypted with a different session key
            const hasSuccessfulDecryption = Object.values(decrypted).some(v => 
              v && !v.startsWith('Failed to decrypt') && !v.startsWith('Session not established')
            )
            if (hasSuccessfulDecryption) {
              decrypted[msg._id] = '⚠️ Encrypted with different session key'
            } else {
              decrypted[msg._id] = `Failed to decrypt: ${error.message || 'Invalid key or corrupted data'}`
            }
          }
        } else {
          console.warn(`[MESSAGE] No session key for partner ${partnerId}, message ${msg._id} cannot be decrypted`)
          decrypted[msg._id] = 'Session not established'
        }
      }
      setDecryptedMessages(decrypted)
    }
    decryptAll()
  }, [messages, currentUserId, conversationId])

  return (
    <div className="space-y-2">
      {messages.map((msg) => {
        const isOwn = msg.senderId === currentUserId
        const text = decryptedMessages[msg._id] || 'Decrypting...'
        const isError = text === 'Failed to decrypt' || text === 'Session not established'

        return (
          <div key={msg._id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`p-2 rounded max-w-xs ${
                isError
                  ? 'bg-destructive/10 text-destructive'
                  : isOwn
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              <p className="text-sm">{text}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}


