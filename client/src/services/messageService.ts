import api from './api'
import { EncryptedMessage } from '@/crypto/messageEncryption'

export interface Message {
  _id: string
  senderId: string
  recipientId: string
  ciphertext: string
  iv: string
  tag: string
  timestamp: Date
  sequenceNumber: number
  nonce: string
  createdAt: Date
}

export const messageService = {
  send: async (recipientId: string, encrypted: EncryptedMessage) => {
    const response = await api.post('/messages/send', {
      recipientId,
      ...encrypted,
    })
    return response.data
  },

  getAllConversations: async () => {
    const response = await api.get('/messages/conversations')
    return response.data as string[] // Array of user IDs
  },

  getConversation: async (userId: string) => {
    const response = await api.get(`/messages/conversation/${userId}`)
    return response.data as Message[]
  },

  getMessage: async (messageId: string) => {
    const response = await api.get(`/messages/${messageId}`)
    return response.data as Message
  },
}


