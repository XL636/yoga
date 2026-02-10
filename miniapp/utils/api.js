/**
 * API utility for WeChat miniapp.
 * Wraps wx.request with token management.
 */

// Dev: use local backend. Production: change to your server domain.
const BASE_URL = 'http://localhost:3000'

/**
 * Make an API request.
 * @param {string} method - HTTP method
 * @param {string} path - API path (e.g. '/sessions')
 * @param {object} [data] - Request body
 * @param {boolean} [auth=true] - Whether to include auth token
 * @returns {Promise<object>} - Response data ({ ok, data/error })
 */
function request(method, path, data, auth = true) {
  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' }

    if (auth) {
      const token = wx.getStorageSync('token')
      if (token) {
        header['Authorization'] = 'Bearer ' + token
      }
    }

    wx.request({
      url: BASE_URL + path,
      method,
      data,
      header,
      success(res) {
        if (res.statusCode === 401) {
          // Token expired, clear and redirect to login
          wx.removeStorageSync('token')
          getApp().globalData.token = null
          wx.showToast({ title: '请重新登录', icon: 'none' })
          resolve({ ok: false, error: { code: 'UNAUTHORIZED', message: '请重新登录' } })
          return
        }
        resolve(res.data)
      },
      fail(err) {
        wx.showToast({ title: '网络错误', icon: 'none' })
        reject(err)
      },
    })
  })
}

function get(path, auth) {
  return request('GET', path, undefined, auth)
}

function post(path, data, auth) {
  return request('POST', path, data, auth)
}

module.exports = { get, post, request, BASE_URL }
