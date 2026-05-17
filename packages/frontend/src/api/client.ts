import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error ?? error.message
    if (message && error instanceof Error) {
      error.message = message
    }
    console.error(`[API ${error.config?.method?.toUpperCase()} ${error.config?.url}]`, message)
    return Promise.reject(error)
  }
)
