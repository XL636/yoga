const api = require('../../utils/api.js')
const dateUtil = require('../../utils/date.js')

Page({
  data: {
    sessionId: '',
    session: null,
    booking: null,   // Active booking for this session (HOLD or CONFIRMED)
    _dateTime: '',
    holding: false,
    confirming: false,
    cancelling: false,
    statusText: {
      HOLD: '占位中',
      CONFIRMED: '已确认',
      CANCELLED: '已取消',
      CHECKED_IN: '已签到',
      NO_SHOW: '未到',
    },
  },

  onLoad(options) {
    this.setData({ sessionId: options.id })
    this.fetchDetail()
  },

  onShow() {
    if (this.data.sessionId) {
      this.fetchDetail()
    }
  },

  async fetchDetail() {
    try {
      const res = await api.get(`/sessions/${this.data.sessionId}`)
      if (res.ok) {
        this.setData({
          session: res.data,
          _dateTime: dateUtil.formatDateTime(res.data.start_time),
        })
      }

      // Check if user has active booking for this session
      const bookingsRes = await api.get('/me/bookings')
      if (bookingsRes.ok) {
        const active = bookingsRes.data.find(
          b => b.session_id === this.data.sessionId && (b.status === 'HOLD' || b.status === 'CONFIRMED')
        )
        this.setData({ booking: active || null })
      }
    } catch (e) {
      console.error('Fetch detail failed:', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  async holdBooking() {
    this.setData({ holding: true })
    try {
      const res = await api.post(`/sessions/${this.data.sessionId}/hold`)
      if (res.ok) {
        wx.showToast({ title: '占位成功', icon: 'success' })
        this.setData({ booking: res.data })
        this.fetchDetail()
      } else {
        wx.showToast({ title: res.error?.message || '占位失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'none' })
    } finally {
      this.setData({ holding: false })
    }
  },

  async confirmBooking() {
    if (!this.data.booking) return
    this.setData({ confirming: true })
    try {
      const res = await api.post(`/bookings/${this.data.booking.id}/confirm`)
      if (res.ok) {
        wx.showToast({ title: '预约成功', icon: 'success' })
        this.setData({ booking: res.data })
        this.fetchDetail()
      } else {
        wx.showToast({ title: res.error?.message || '确认失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  async cancelBooking() {
    if (!this.data.booking) return

    const that = this
    wx.showModal({
      title: '确认取消',
      content: this.data.booking.status === 'CONFIRMED' ? '确定要取消已确认的预约吗？' : '确定要取消占位吗？',
      success(modalRes) {
        if (modalRes.confirm) {
          that.doCancel()
        }
      },
    })
  },

  async doCancel() {
    this.setData({ cancelling: true })
    try {
      const res = await api.post(`/bookings/${this.data.booking.id}/cancel`)
      if (res.ok) {
        wx.showToast({ title: '已取消', icon: 'success' })
        this.setData({ booking: null })
        this.fetchDetail()
      } else {
        wx.showToast({ title: res.error?.message || '取消失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'none' })
    } finally {
      this.setData({ cancelling: false })
    }
  },
})
