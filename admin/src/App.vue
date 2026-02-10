<template>
  <el-container style="min-height: 100vh">
    <el-aside width="200px" style="background: #304156">
      <div style="color: #fff; text-align: center; padding: 20px 0; font-size: 18px; font-weight: bold">
        瑜伽管理后台
      </div>
      <el-menu
        :default-active="route.path"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
      >
        <el-menu-item index="/templates">
          <span>课程模板</span>
        </el-menu-item>
        <el-menu-item index="/sessions">
          <span>排课管理</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-main style="padding: 20px">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup>
import { useRoute } from 'vue-router'
const route = useRoute()
</script>
