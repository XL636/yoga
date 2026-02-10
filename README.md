# 瑜伽预约系统

微信小程序 + Web 管理后台 + Node.js 后端的瑜伽课程预约系统。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js + Express + better-sqlite3 |
| 管理后台 | Vue 3 + Element Plus + Vite |
| 小程序 | 微信原生 (WXML/WXSS/JS) |
| 数据库 | SQLite |

## 快速开始

### 环境要求
- Node.js v18+
- 微信开发者工具（小程序端）

### 1. 启动后端

```bash
cd backend
npm install
npm run dev
```

后端运行在 http://localhost:3000 ，验证：

```bash
curl http://localhost:3000/health
# {"ok":true,"data":{"status":"healthy"}}
```

### 2. 启动管理后台

```bash
cd admin
npm install
npm run dev
```

打开 http://localhost:5173 ，用管理后台创建课程模板和排课。

### 3. 启动小程序

详见 [docs/miniapp.md](docs/miniapp.md)。简要步骤：

1. 微信开发者工具 → 导入 `miniapp/` 目录
2. 填入你的 AppID
3. 开启「不校验合法域名」
4. 编译运行

## MVP 验证闭环

1. **管理员排课**：管理后台 → 新建模板 → 新建排课
2. **用户预约**：小程序 → 课程表 → 点击课程 → 立即预约 → 确认预约
3. **用户取消**：小程序 → 我的预约 → 取消
4. **管理员查看**：管理后台 → 排课管理 → 预约名单

## 运行测试

```bash
cd backend
npm test
# 45 pass, 0 fail
```

测试覆盖：
- 状态机合法/非法迁移
- 并发防超卖（10 人抢 5 个名额 → 恰好 5 成功）
- 取消回滚（confirmed_count 正确递减）
- 完整 HTTP API 集成测试（15 个端到端用例）

## API 速查

### 用户端
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /auth/login | 微信登录 |
| GET | /sessions?date=YYYY-MM-DD | 课程列表 |
| GET | /sessions/:id | 课程详情 |
| POST | /sessions/:id/hold | 占位 |
| POST | /bookings/:id/confirm | 确认预约 |
| POST | /bookings/:id/cancel | 取消预约 |
| GET | /me/bookings | 我的预约 |

### 管理后台
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /admin/templates | 创建模板 |
| GET | /admin/templates | 模板列表 |
| POST | /admin/sessions | 排课 |
| GET | /admin/sessions | 课程列表 |
| GET | /admin/sessions/:id/bookings | 预约名单 |

管理后台认证：Basic Auth `admin:yoga2024`

## 项目结构

```
yoga/
├── backend/          # Node.js + Express 后端
│   ├── src/
│   │   ├── app.js
│   │   ├── db/       # 数据库初始化 + 建表
│   │   ├── domain/   # 状态机
│   │   ├── services/ # 核心业务逻辑
│   │   ├── routes/   # API 路由
│   │   └── middleware/# JWT + Basic Auth
│   └── tests/        # 45 个测试
├── admin/            # Vue 3 管理后台
├── miniapp/          # 微信小程序
└── docs/             # 文档
```

## 常见问题

**端口 3000 被占用**
```bash
# Windows
netstat -ano | findstr :3000
# 修改 PORT 环境变量
set PORT=3001 && cd backend && npm run dev
```

**管理后台页面空白**
确保后端已启动（Vite 代理需要后端在 localhost:3000）。

**小程序请求失败**
确保在微信开发者工具中勾选「不校验合法域名」。
