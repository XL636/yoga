import axios from 'axios'

const api = axios.create({
  baseURL: '/api/admin',
  headers: {
    Authorization: 'Basic ' + btoa('admin:yoga2024'),
  },
})

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const msg = err.response?.data?.error?.message || err.message
    return Promise.reject(new Error(msg))
  }
)

export default api
