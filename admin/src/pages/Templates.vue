<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px">
      <h2 style="margin: 0">课程模板</h2>
      <el-button type="primary" @click="showCreate = true">新建模板</el-button>
    </div>

    <el-table :data="templates" stripe v-loading="loading">
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="duration_minutes" label="时长(分钟)" width="100" />
      <el-table-column prop="difficulty" label="难度" width="100">
        <template #default="{ row }">
          <el-tag :type="difficultyTag(row.difficulty)">{{ row.difficulty }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="default_capacity" label="默认容量" width="100" />
      <el-table-column prop="description" label="描述" show-overflow-tooltip />
    </el-table>

    <el-dialog v-model="showCreate" title="新建课程模板" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：哈他瑜伽" />
        </el-form-item>
        <el-form-item label="时长(分钟)">
          <el-input-number v-model="form.duration_minutes" :min="15" :max="180" :step="15" />
        </el-form-item>
        <el-form-item label="难度">
          <el-select v-model="form.difficulty">
            <el-option label="入门" value="beginner" />
            <el-option label="中级" value="intermediate" />
            <el-option label="高级" value="advanced" />
          </el-select>
        </el-form-item>
        <el-form-item label="默认容量">
          <el-input-number v-model="form.default_capacity" :min="1" :max="100" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="createTemplate" :loading="submitting">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const templates = ref([])
const loading = ref(false)
const showCreate = ref(false)
const submitting = ref(false)

const form = ref({
  name: '',
  duration_minutes: 60,
  difficulty: 'beginner',
  default_capacity: 20,
  description: '',
})

function difficultyTag(d) {
  return { beginner: 'success', intermediate: 'warning', advanced: 'danger' }[d] || 'info'
}

async function fetchTemplates() {
  loading.value = true
  try {
    const res = await api.get('/templates')
    templates.value = res.data
  } catch (e) {
    ElMessage.error('加载失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

async function createTemplate() {
  if (!form.value.name) {
    ElMessage.warning('请输入模板名称')
    return
  }
  submitting.value = true
  try {
    await api.post('/templates', form.value)
    ElMessage.success('创建成功')
    showCreate.value = false
    form.value = { name: '', duration_minutes: 60, difficulty: 'beginner', default_capacity: 20, description: '' }
    await fetchTemplates()
  } catch (e) {
    ElMessage.error('创建失败: ' + e.message)
  } finally {
    submitting.value = false
  }
}

onMounted(fetchTemplates)
</script>
