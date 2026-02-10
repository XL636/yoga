const api = require('../../utils/api.js')
const dateUtil = require('../../utils/date.js')

Page({
  data: {
    bookings: [],
    filteredBookings: [],
    activeTab: 'active',
    loading: false,
    statusText: {
      HOLD: '占位中',
      CONFIRMED: '已确认',
      CANCELLED: '已取消',
      CHECKED_IN: '已签到',
      NO_SHOW: '未到',
    },
    cancelReasonText: {
      USER_CANCEL: '用户取消',
      LATE_CANCEL: '迟到取消',
      EXPIRED: '占位过期',
    },
  },

  onShow() {
    this.fetchBookings()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    this.filterBookings()
  },

  filterBookings() {
    const { bookings, activeTab } = this.data
    let filtered
    if (activeTab === 'active') {
      filtered = bookings.filter(b => b.status === 'HOLD' || b.status === 'CONFIRMED')
    } else {
      filtered = bookings.filter(b => b.status !== 'HOLD' && b.status !== 'CONFIRMED')
    }
    this.setData({ filteredBookings: filtered })
  },

  async fetchBookings() {
    this.setData({ loading: true })
    try {
      const app = getApp()
      if (!app.globalData.token) {
        await app.login()
      }

      const res = await api.get('/me/bookings')
      if (res.ok) {
        const bookings = res.data.map(b => ({
          ...b,
          _dateTime: dateUtil.formatDateTime(b.session_start_time),
        }))
        this.setData({ bookings })
        this.filterBookings()
      }
    } catch (e) {
      console.error('Fetch bookings failed:', e)
    } finally {
      this.setData({ loading: false })
    }
  },

  async confirmBooking(e) {
    const id = e.currentTarget.dataset.id
    try {
      const res = await api.post(`/bookings/${id}/confirm`)
      if (res.ok) {
        wx.showToast({ title: '确认成功', icon: 'success' })
        this.fetchBookings()
      } else {
        wx.showToast({ title: res.error?.message || '确认失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  },

  async cancelBooking(e) {
    const id = e.currentTarget.dataset.id
    const status = e.currentTarget.dataset.status
    const that = this

    wx.showModal({
      title: '确认取消',
      content: status === 'CONFIRMED' ? '确定取消已确认的预约吗？' : '确定取消占位吗？',
      success(modalRes) {
        if (modalRes.confirm) {
          that.doCancel(id)
        }
      },
    })
  },

  async doCancel(id) {
    try {
      const res = await api.post(`/bookings/${id}/cancel`)
      if (res.ok) {
        wx.showToast({ title: '已取消', icon: 'success' })
        this.fetchBookings()
      } else {
        wx.showToast({ title: res.error?.message || '取消失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  },
})
