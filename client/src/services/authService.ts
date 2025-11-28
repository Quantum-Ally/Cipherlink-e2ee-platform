import api from './api'

export interface RegisterData {
  username: string
  password: string
  publicKey: string
}

export interface LoginData {
  username: string
  password: string
}

export interface User {
  id: string
  username: string
  publicKey: string
}

export const authService = {
  register: async (data: RegisterData) => {
    const response = await api.post('/auth/register', data)
    return response.data
  },

  login: async (data: LoginData) => {
    const response = await api.post('/auth/login', data)
    return response.data
  },

  getPublicKey: async (userId: string) => {
    const response = await api.get(`/users/${userId}/public-key`)
    return response.data
  },

  searchUsers: async (query: string) => {
    const response = await api.get(`/users/search?q=${query}`)
    return response.data
  },
}

