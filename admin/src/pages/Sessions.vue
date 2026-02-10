<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px">
      <h2 style="margin: 0">排课管理</h2>
      <div style="display: flex; gap: 12px; align-items: center">
        <el-date-picker v-model="dateFilter" type="date" placeholder="选择日期" value-format="YYYY-MM-DD"
          @change="fetchSessions" clearable />
        <el-button type="primary" @click="openCreate">新建排课</el-button>
      </div>
    </div>

    <el-table :data="sessions" stripe v-loading="loading">
      <el-table-column prop="template_name" label="课程" width="150" />
      <el-table-column prop="coach_name" label="教练" width="100" />
      <el-table-column label="上课时间" width="180">
        <template #default="{ row }">{{ formatTime(row.start_time) }}</template>
      </el-table-column>
      <el-table-column label="容量" width="120">
        <template #default="{ row }">
          <span :style="{ color: row.confirmed_count >= row.capacity ? '#f56c6c' : '#67c23a' }">
            {{ row.confirmed_count }} / {{ row.capacity }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTag(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button size="small" @click="$router.push(`/sessions/${row.id}/bookings`)">
            预约名单
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showCreate" title="新建排课" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="课程模板" required>
          <el-select v-model="form.template_id" placeholder="选择模板" style="width: 100%">
            <el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="教练">
          <el-input v-model="form.coach_name" placeholder="教练姓名" />
        </el-form-item>
        <el-form-item label="上课时间" required>
          <el-date-picker v-model="form.start_time" type="datetime" placeholder="选择时间"
            value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item label="容量">
          <el-input-number v-model="form.capacity" :min="1" :max="100" />
          <span style="margin-left: 8px; color: #909399; font-size: 12px">
            留空则使用模板默认容量
          </span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="createSession" :loading="submitting">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const sessions = ref([])
const templates = ref([])
const loading = ref(false)
const showCreate = ref(false)
const submitting = ref(false)
const dateFilter = ref('')

const form = ref({
  template_id: '',
  coach_name: '',
  start_time: '',
  capacity: null,
})

function statusTag(s) {
  return { SCHEDULED: 'success', CANCELLED: 'danger', COMPLETED: 'info' }[s] || 'info'
}

function formatTime(t) {
  if (!t) return ''
  return t.replace('T', ' ').slice(0, 16)
}

async function fetchSessions() {
  loading.value = true
  try {
    const params = dateFilter.value ? `?date=${dateFilter.value}` : ''
    const res = await api.get('/sessions' + params)
    sessions.value = res.data
  } catch (e) {
    ElMessage.error('加载失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

async function fetchTemplates() {
  try {
    const res = await api.get('/templates')
    templates.value = res.data
  } catch (e) {
    ElMessage.error('加载模板失败: ' + e.message)
  }
}

function openCreate() {
  form.value = { template_id: '', coach_name: '', start_time: '', capacity: null }
  showCreate.value = true
}

async function createSession() {
  if (!form.value.template_id || !form.value.start_time) {
    ElMessage.warning('请选择模板和上课时间')
    return
  }
  submitting.value = true
  try {
    const body = { ...form.value }
    if (!body.capacity) delete body.capacity
    await api.post('/sessions', body)
    ElMessage.success('排课成功')
    showCreate.value = false
    await fetchSessions()
  } catch (e) {
    ElMessage.error('排课失败: ' + e.message)
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  fetchSessions()
  fetchTemplates()
})
</script>
