<template>
  <div>
    <div style="margin-bottom: 20px">
      <el-button @click="$router.push('/sessions')" plain>← 返回排课列表</el-button>
    </div>

    <el-card v-if="session" style="margin-bottom: 20px">
      <template #header>
        <span style="font-size: 18px; font-weight: bold">{{ session.template_name || '课程' }} - 预约名单</span>
      </template>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="教练">{{ session.coach_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="上课时间">{{ formatTime(session.start_time) }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="statusTag(session.status)">{{ session.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="已确认/容量">
          <span :style="{ color: session.confirmed_count >= session.capacity ? '#f56c6c' : '#67c23a', fontWeight: 'bold' }">
            {{ session.confirmed_count }} / {{ session.capacity }}
          </span>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-table :data="bookings" stripe v-loading="loading">
      <el-table-column prop="nickname" label="用户" width="150" />
      <el-table-column prop="status" label="预约状态" width="120">
        <template #default="{ row }">
          <el-tag :type="bookingTag(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="预约时间" width="180">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="确认时间" width="180">
        <template #default="{ row }">{{ formatTime(row.confirmed_at) }}</template>
      </el-table-column>
      <el-table-column prop="cancel_reason" label="取消原因" width="120">
        <template #default="{ row }">{{ row.cancel_reason || '-' }}</template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && bookings.length === 0" description="暂无预约" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const props = defineProps({ id: String })

const session = ref(null)
const bookings = ref([])
const loading = ref(false)

function statusTag(s) {
  return { SCHEDULED: 'success', CANCELLED: 'danger', COMPLETED: 'info' }[s] || 'info'
}

function bookingTag(s) {
  return {
    HOLD: 'warning',
    CONFIRMED: 'success',
    CANCELLED: 'info',
    CHECKED_IN: 'primary',
    NO_SHOW: 'danger',
  }[s] || 'info'
}

function formatTime(t) {
  if (!t) return '-'
  return t.replace('T', ' ').slice(0, 16)
}

async function fetchBookings() {
  loading.value = true
  try {
    const res = await api.get(`/sessions/${props.id}/bookings`)
    session.value = res.data.session

    // Join template_name from session list if missing
    if (!session.value.template_name) {
      try {
        const sessRes = await api.get('/sessions')
        const found = sessRes.data.find(s => s.id === props.id)
        if (found) session.value.template_name = found.template_name
      } catch {}
    }

    bookings.value = res.data.bookings
  } catch (e) {
    ElMessage.error('加载失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

onMounted(fetchBookings)
</script>
