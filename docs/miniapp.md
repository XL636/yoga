# 微信小程序 — 开发与运行指南

## 前置条件

1. **微信开发者工具**：[下载地址](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. **小程序 AppID**：在 [微信公众平台](https://mp.weixin.qq.com) → 开发管理 → 开发设置 中获取
3. **后端服务已启动**：`cd backend && npm run dev`（默认 http://localhost:3000）

## 导入项目

1. 打开微信开发者工具
2. 选择「导入项目」
3. 目录选择：`miniapp/` 文件夹
4. AppID 填写你的小程序 AppID
5. 点击「导入」

## 开发设置

### 关闭域名校验（开发阶段必须）
在微信开发者工具右上角：
- 「详情」→「本地设置」→ 勾选 **「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**

### 修改后端地址
编辑 `miniapp/utils/api.js`，修改 `BASE_URL`：
```javascript
// 开发阶段（本地）
const BASE_URL = 'http://localhost:3000'

// 上线后（替换为你的服务器地址）
const BASE_URL = 'https://your-domain.com'
```

### 配置 AppID
编辑 `miniapp/project.config.json`，将 `appid` 字段替换为你的 AppID：
```json
"appid": "wx1234567890abcdef"
```

## 使用流程

1. **确保后端运行中**（`cd backend && npm run dev`）
2. **确保已通过管理后台排课**（http://localhost:5173 → 创建模板 → 排课）
3. 在微信开发者工具中：
   - 首页「课程表」：选择日期，查看可预约的课程
   - 点击课程进入「详情」：点「立即预约」→ 占位成功 → 点「确认预约」
   - 底部 Tab「我的预约」：查看所有预约，可确认或取消

## 上线前 checklist

- [ ] 修改 `utils/api.js` 中的 `BASE_URL` 为正式服务器地址
- [ ] 修改 `project.config.json` 中的 `appid` 为正式 AppID
- [ ] 在微信公众平台 → 开发管理 → 开发设置 → 服务器域名 中添加 request 合法域名
- [ ] 后端配置 `WX_APPID` 和 `WX_SECRET` 环境变量
- [ ] 后端配置 `JWT_SECRET` 为安全的随机字符串
- [ ] 后端配置 `ADMIN_PASS` 为强密码
- [ ] 后端部署到支持 HTTPS 的服务器
