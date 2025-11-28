import api from './api'
import { EncryptedFile } from '@/crypto/fileEncryption'

export interface File {
  _id: string
  senderId: string
  recipientId: string
  fileName: string
  fileSize: number
  mimeType: string
  chunks: EncryptedFile['chunks']
  uploadedAt: Date
}

export const fileService = {
  upload: async (recipientId: string, encryptedFile: EncryptedFile) => {
    const response = await api.post('/files/upload', {
      recipientId,
      ...encryptedFile,
    })
    return response.data
  },

  getFile: async (fileId: string) => {
    const response = await api.get(`/files/${fileId}`)
    return response.data as File
  },

  getConversationFiles: async (userId: string) => {
    const response = await api.get(`/files/conversation/${userId}`)
    return response.data as File[]
  },
}


