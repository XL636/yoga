# CLAUDE.md — 瑜伽预约系统（微信小程序 + 管理后台）Vibe Coding 主控文件

> 本文件是项目"宪法 / 主心骨"。任何 Agent（Claude Code / Cursor / Codex 等）必须严格遵循：
> **领域模型 → 状态机 → 防超卖 → 可验证迭代**
> 目标：你只负责决策与验收；AI 负责按规则推进实现。
> **禁止跳步。禁止先写 UI。**

---

## 0. 项目一句话目标

做一个"专门用于预约瑜伽课程"的系统（**MVP 单店模式**），包含：

- **微信小程序（用户端）**：查课表 → 预约（占位→确认）→ 取消 → 我的预约
- **Web 管理后台（商家端）**：建课型模板 → 排课生成 Session → 管理预约名单 → 签到核销（可后置）
- **后端服务**：状态机 + 规则配置化 + 并发不超卖（数据库原子写/事务）+ 可测闭环

---

## 0.5 技术栈（明确选型）

| 层           | 技术                                      |
| ------------ | ----------------------------------------- |
| **后端**     | Node.js (v18+) + Express + better-sqlite3 |
| **数据库**   | SQLite（单文件，零运维）                  |
| **管理后台** | Vue 3 + Element Plus + Vite               |
| **小程序**   | 微信原生（WXML/WXSS/JS）                 |
| **测试**     | Node.js 内置 test runner (`node --test`)  |
| **包管理**   | npm                                       |

### 微信登录流程（MVP）
1. 小程序调用 `wx.login()` 获取 `code`
2. 后端 `POST /auth/login` 接收 `code`，调用微信 `code2session` 接口换取 `openid`
3. 后端用 `openid` 查找或创建 User，生成 JWT token 返回小程序
4. 后续请求 Header 带 `Authorization: Bearer <token>`，后端解析出 `user_id`

---

## 1. 硬性规则（不可违反）

1. **禁止先写 UI**
   必须先完成：领域模型、状态机、数据库 schema/migrations、关键 service 逻辑与测试。
2. **容量修改必须原子**
   任何导致"课程名额变化"的行为，必须使用原子更新/事务；严禁"先查再改"。
3. **命令式 API（禁止纯 CRUD）**
   API 必须体现动作语义（hold/confirm/cancel/checkin），禁止 `POST /booking` 这种纯 CRUD。
4. **小步可验证**
   每一轮必须提供：运行命令 + 验证步骤（curl 或 UI 路径）。做不到不得进入下一轮。
5. **关键路径必测**
   至少覆盖：并发不超卖测试 + 取消回滚测试。
6. **状态机一致性**
   所有状态迁移必须校验合法性；禁止跳状态。
7. **安全基础**
   user_id 必须来自登录态（auth context），禁止信任前端传参；后台接口必须保护（MVP 可用 Basic Auth/固定管理员账号）。

---

## 2. 产品范围（MVP 只做这些）

### 2.1 用户端（微信小程序）
- 课程表（按日/周）
- 课程详情
- 预约（占位 → 确认）
- 取消预约
- 我的预约列表（待上课/已取消/已完成）

> MVP 不做：候补、私教排期、拼团、裂变、分销、会员等级、次卡；但架构需可扩展。

### 2.2 商家端（Web 后台）
- 课程模板管理（课型、时长、难度、默认容量）
- 排课（基于模板生成 Session）
- 查看某节课的预约名单
- 手动签到（可后置）

### 2.3 后端必须完成
- Session 库存控制（capacity / confirmed_count）
- Booking 状态机（HOLD/CONFIRMED/CANCELLED/…）
- 规则配置（取消规则、占位 TTL、最大同时预约等）
- 并发不超卖（并发测试必须通过）

---

## 3. 领域模型（MVP 单店，最小集合）

### 3.1 核心实体
- **ClassTemplate**：课程模板（课型定义）
- **Session**：具体一节课（由模板排出来的场次）
- **Booking**：预约记录（带状态机）
- **Policy**：规则配置（可按模板覆盖）
- **User**：用户（微信登录，openid 为唯一标识）
- **AdminUser**：后台管理员（MVP 固定账号 + Basic Auth）

> MVP 单店模式：不需要 Studio 表。如将来多店，加 studio_id 外键即可。
> MVP 不做：Pass/Membership、Order/Payment（将来扩展）。

### 3.2 必要字段（MVP）
- **ClassTemplate**：`id, name, description, duration_minutes, difficulty, default_capacity, created_at, updated_at`
- **Session**：`id, template_id, coach_name, start_time, end_time, capacity, confirmed_count, status, created_at, updated_at`
- **Booking**：`id, user_id, session_id, status, expires_at, confirmed_at, cancelled_at, cancel_reason, created_at, updated_at`
- **Policy**：`id, template_id(nullable), cancel_free_before_minutes, hold_ttl_minutes, max_active_bookings, created_at, updated_at`
- **User**：`id, openid, nickname, avatar_url, created_at, updated_at`

---

## 4. 状态机（必须严格执行）

### 4.1 Session.status
- `SCHEDULED`：可预约
- `CANCELLED`：场次取消
- `COMPLETED`：课程结束

### 4.2 Booking.status
- `HOLD`：临时占位（有 expires_at，超时自动释放）
- `CONFIRMED`：确认成功（MVP 模拟支付，直接确认）
- `CANCELLED`：已取消
- `CHECKED_IN`：已签到
- `NO_SHOW`：未到（可后置规则）

### 4.3 合法状态迁移
```
HOLD → CONFIRMED（confirm 动作）
HOLD → CANCELLED（cancel 或过期）
CONFIRMED → CANCELLED（cancel 动作）
CONFIRMED → CHECKED_IN（签到动作）
CONFIRMED → NO_SHOW（后置标记）
```

### 4.4 系统不变量（任何时候必须成立）
- `confirmed_count <= capacity`
- `CONFIRMED` 的 Booking 数量永远不超过 `capacity`
- `HOLD -> CONFIRMED` 必须与库存扣减原子执行
- `CANCELLED` 不允许回滚到任何前序状态（想再次预约只能新建 booking）

---

## 5. 并发与防超卖（强制实现）

### 5.1 推荐方案：数据库原子扣减（MVP 首选）
确认预约时必须使用类似 SQL：

```sql
UPDATE sessions
SET confirmed_count = confirmed_count + 1, updated_at = ?
WHERE id = ?
  AND status = 'SCHEDULED'
  AND confirmed_count < capacity;
```

若 `changes == 0`：代表满员/不可约，必须返回"名额不足"（错误码 `SESSION_FULL`）。

### 5.2 取消回滚（仅对已确认预约）
仅当 `booking=CONFIRMED` 且 `session=SCHEDULED` 时允许回滚：

```sql
UPDATE sessions
SET confirmed_count = confirmed_count - 1, updated_at = ?
WHERE id = ?
  AND confirmed_count > 0;
```

### 5.3 HOLD 超时释放（MVP 懒清理）
HOLD 必须有 `expires_at`。MVP 采用懒清理：confirm/cancel 时检查是否过期。

过期 HOLD 只能进入 `CANCELLED`，cancel_reason = `EXPIRED`。

---

## 6. 规则系统（配置化，不写死）

### 6.1 默认规则（MVP）
- `hold_ttl_minutes = 10`
- `cancel_free_before_minutes = 240`（开课前 4 小时）
- `max_active_bookings = 3`

### 6.2 实现方式
- Policy 支持：全局默认 + 模板覆盖
- 提供函数：`getPolicy(templateId)`（合并默认值）

### 6.3 取消行为（MVP）
- **在免费窗口内**：允许取消 + 回滚库存
- **超出免费窗口**：仍允许取消，但标记 `cancel_reason = LATE_CANCEL`（将来可扣费）

---

## 7. API 设计（命令式，禁止 CRUD）

### 7.1 必须实现（MVP）
```
POST   /auth/login                    微信登录
GET    /sessions?date=YYYY-MM-DD      课程列表
GET    /sessions/:id                  课程详情
POST   /sessions/:id/hold             占位
POST   /bookings/:id/confirm          确认
POST   /bookings/:id/cancel           取消
GET    /me/bookings                   我的预约
```

### 7.2 管理后台 API（MVP）
```
POST   /admin/templates               创建模板
GET    /admin/templates               模板列表
POST   /admin/sessions                排课
GET    /admin/sessions                课程列表
GET    /admin/sessions/:id/bookings   预约名单
```

### 7.3 统一返回结构
- **成功**：`{ ok: true, data: ... }`
- **失败**：`{ ok: false, error: { code, message } }`

常用 `error.code`：
- `SESSION_FULL`
- `SESSION_NOT_BOOKABLE`
- `BOOKING_EXPIRED`
- `INVALID_STATE`
- `POLICY_BLOCKED`
- `UNAUTHORIZED`

---

## 8. 日志（轻量但必须）

console.log 结构化日志到 stdout：
- `session_hold_created`（booking_id, session_id, user_id, expires_at）
- `booking_confirmed`（booking_id, session_id, user_id）
- `booking_cancelled`（booking_id, reason）
- `session_capacity_changed`（session_id, before, after）

---

## 9. 安全（MVP 也要做到）

- `user_id` 必须来自 JWT token（禁止前端直接传）
- admin API 用 Basic Auth 保护（MVP 固定账号密码，环境变量配置）
- 全部输入校验（date、id、分页参数）
- 状态迁移必须校验合法性（非法直接拒绝）

---

## 10. 目录结构

```
yoga/
├── CLAUDE.md
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── app.js              # Express 入口
│   │   ├── db/
│   │   │   ├── database.js     # better-sqlite3 初始化
│   │   │   └── migrations.js   # 建表 + 种子数据
│   │   ├── domain/
│   │   │   └── stateMachine.js # 状态机定义与校验
│   │   ├── services/
│   │   │   ├── bookingService.js
│   │   │   ├── sessionService.js
│   │   │   └── policyService.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── sessions.js
│   │   │   ├── bookings.js
│   │   │   └── admin.js
│   │   └── middleware/
│   │       └── auth.js
│   └── tests/
│       ├── concurrency.test.js
│       └── stateMachine.test.js
├── admin/                      # Vue 3 + Element Plus (Iteration 3)
├── miniapp/                    # 微信原生小程序 (Iteration 4)
└── docs/
    └── policy.md
```

---

## 11. Vibe Coding 工作循环（每轮输出格式强制）

每轮输出必须包含：

1. **本轮目标**（≤3）
2. **文件变更清单**（新增/修改）
3. **关键实现要点**（≤8）
4. **运行命令**（如何启动/测试）
5. **验证步骤**（curl 或 UI 点击路径）
6. **风险 / TODO**（仅列本轮范围）

---

## 12. 强制迭代顺序（不得跳步）

### Iteration 1：核心骨架
- SQLite schema / migrations
- 状态机定义
- 原子 confirm + cancel 回滚 service
- 并发测试（10 抢 5）+ 状态机测试

### Iteration 2：后端命令 API
- 微信登录（wx.login → code2session → JWT）
- hold / confirm / cancel / 查课表 / 我的预约
- 管理后台 API（模板 + 排课 + 预约名单）
- curl 集成测试跑通闭环

### Iteration 3：管理后台
- Vue 3 + Element Plus
- 排课 + 查看预约

### Iteration 4：小程序
- 课表 → 详情 → 预约 → 我的预约
- 调用后端 API 跑通闭环

---

## 13. 测试要求（必须通过）

### 13.1 并发不超卖测试（必做）
- 场次 `capacity=5`
- 并发 10 个 `confirm`
- 最终成功数必须 = 5
- `confirmed_count` 必须 = 5
- 失败请求必须返回 `SESSION_FULL`（或等价语义）

### 13.2 取消回滚测试（必做）
- CONFIRMED 取消后 `confirmed_count` 正确回滚
- HOLD 过期后不能 confirm（返回 `BOOKING_EXPIRED`）
- 非法状态迁移（如 CANCELLED 再 confirm）必须拒绝（`INVALID_STATE`）

---

## 14. 运行与交付（必须提供）

### 14.1 每个子项目必须一键启动
- **backend**：`cd backend && npm install && npm run dev`
- **admin**：`cd admin && npm install && npm run dev`
- **miniapp**：写入 `docs/miniapp.md`（微信开发者工具导入与运行）

### 14.2 README 必须包含
- 环境依赖
- 启动命令
- 验证步骤（MVP 闭环）
- 常见问题（端口占用、数据库未启动等）

---

## 15. MVP 完成定义（DoD）

MVP 视为完成，当且仅当满足：

- ✅ 管理后台能排课生成 session
- ✅ 用户端能查询到 session 并能 hold→confirm
- ✅ 用户能取消预约并回滚库存
- ✅ 并发测试通过（不超卖）
- ✅ README 可让第三方按说明跑起来并复现闭环
