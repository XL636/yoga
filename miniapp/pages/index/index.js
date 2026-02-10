const api = require('../../utils/api.js')
const dateUtil = require('../../utils/date.js')

Page({
  data: {
    dates: [],
    selectedDate: '',
    sessions: [],
    loading: false,
  },

  onLoad() {
    const dates = dateUtil.getDateRange(7)
    this.setData({
      dates,
      selectedDate: dates[0].date,
    })
    this.ensureLogin().then(() => this.fetchSessions())
  },

  onShow() {
    // Refresh when coming back from detail page
    if (this.data.selectedDate) {
      this.fetchSessions()
    }
  },

  async ensureLogin() {
    const app = getApp()
    if (!app.globalData.token) {
      try {
        await app.login()
      } catch (e) {
        console.error('Login failed:', e)
      }
    }
  },

  selectDate(e) {
    const date = e.currentTarget.dataset.date
    this.setData({ selectedDate: date })
    this.fetchSessions()
  },

  async fetchSessions() {
    this.setData({ loading: true })
    try {
      const res = await api.get(`/sessions?date=${this.data.selectedDate}`)
      if (res.ok) {
        const sessions = res.data.map(s => ({
          ...s,
          _startTime: dateUtil.formatTime(s.start_time),
          _endTime: dateUtil.formatTime(s.end_time),
        }))
        this.setData({ sessions })
      }
    } catch (e) {
      console.error('Fetch sessions failed:', e)
    } finally {
      this.setData({ loading: false })
    }
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },
})
