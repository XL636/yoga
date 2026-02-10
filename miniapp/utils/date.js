/**
 * Date formatting utilities.
 */

/**
 * Format date as YYYY-MM-DD.
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Format time string "YYYY-MM-DD HH:mm:ss" → "HH:mm".
 * @param {string} timeStr
 * @returns {string}
 */
function formatTime(timeStr) {
  if (!timeStr) return ''
  return timeStr.slice(11, 16)
}

/**
 * Format time string → "MM月DD日 HH:mm".
 * @param {string} timeStr
 * @returns {string}
 */
function formatDateTime(timeStr) {
  if (!timeStr) return ''
  const m = parseInt(timeStr.slice(5, 7))
  const d = parseInt(timeStr.slice(8, 10))
  const t = timeStr.slice(11, 16)
  return `${m}月${d}日 ${t}`
}

/**
 * Get day of week label (Chinese).
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string}
 */
function getWeekday(dateStr) {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return days[new Date(dateStr).getDay()]
}

/**
 * Generate an array of dates starting from today.
 * @param {number} count - Number of days
 * @returns {Array<{ date: string, label: string, weekday: string }>}
 */
function getDateRange(count = 7) {
  const result = []
  const today = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const dateStr = formatDate(d)
    const label = i === 0 ? '今天' : i === 1 ? '明天' : `${d.getMonth() + 1}/${d.getDate()}`
    result.push({ date: dateStr, label, weekday: getWeekday(dateStr) })
  }
  return result
}

module.exports = { formatDate, formatTime, formatDateTime, getWeekday, getDateRange }
