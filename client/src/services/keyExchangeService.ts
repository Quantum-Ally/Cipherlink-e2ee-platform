import api from './api'

export const keyExchangeService = {
  initiate: async (recipientId: string, publicKey: string, signature: string, timestamp: number) => {
    const response = await api.post('/key-exchange/initiate', {
      recipientId,
      publicKey,
      signature,
      timestamp,
    })
    return response.data
  },

  respond: async (exchangeId: string, publicKey: string, signature: string, timestamp: number) => {
    const response = await api.post('/key-exchange/response', {
      exchangeId,
      publicKey,
      signature,
      timestamp,
    })
    return response.data
  },

  confirm: async (exchangeId: string, confirmationHash: string) => {
    const response = await api.post('/key-exchange/confirm', {
      exchangeId,
      confirmationHash,
    })
    return response.data
  },

  getPending: async (userId: string) => {
    const response = await api.get(`/key-exchange/pending/${userId}`)
    return response.data
  },

  getResponses: async (userId: string) => {
    const response = await api.get(`/key-exchange/responses/${userId}`)
    return response.data
  },
}


