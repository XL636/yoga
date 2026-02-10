App({
  globalData: {
    token: null,
    userInfo: null,
  },

  onLaunch() {
    // Try to restore token from storage
    const token = wx.getStorageSync('token')
    if (token) {
      this.globalData.token = token
    }
  },

  /**
   * Login: wx.login → backend /auth/login → get JWT token.
   * Returns a Promise that resolves with the token.
   */
  login() {
    return new Promise((resolve, reject) => {
      // If already logged in, return existing token
      if (this.globalData.token) {
        return resolve(this.globalData.token)
      }

      wx.login({
        success: (loginRes) => {
          if (!loginRes.code) {
            return reject(new Error('wx.login failed'))
          }

          const api = require('./utils/api.js')
          api.post('/auth/login', { code: loginRes.code }, false).then((res) => {
            if (res.ok) {
              this.globalData.token = res.data.token
              this.globalData.userInfo = res.data.user
              wx.setStorageSync('token', res.data.token)
              resolve(res.data.token)
            } else {
              reject(new Error(res.error?.message || 'Login failed'))
            }
          }).catch(reject)
        },
        fail: reject,
      })
    })
  },
})
