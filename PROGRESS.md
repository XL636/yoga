# 项目进度追踪

> 每次会话开始，AI 必须先读取本文件恢复上下文。
> 每次会话结束前，用户会要求更新本文件。

---

## 当前状态

- **当前阶段**: MVP 开发完成，进入部署上线阶段
- **整体进度**: Iteration 1-4 全部完成，正在处理生产部署
- **最后更新**: 2026-02-11

---

## 已完成

### Iteration 1: 核心骨架 ✅
- [x] SQLite schema / migrations（6 张表，索引，外键约束）
- [x] 状态机定义（Booking: HOLD→CONFIRMED→CHECKED_IN/CANCELLED/NO_SHOW）
- [x] 原子 confirm + cancel 回滚 service（bookingService.js, 257 行）
- [x] 并发测试（10 抢 5）通过
- [x] 状态机测试通过

### Iteration 2: 后端命令 API ✅
- [x] 微信登录（POST /auth/login，JWT token）
- [x] hold / confirm / cancel 全流程
- [x] 课程查询（GET /sessions）
- [x] 我的预约（GET /me/bookings）
- [x] 管理后台 API（模板 CRUD + 排课 + 预约名单）
- [x] Basic Auth 保护 admin 路由
- [x] 集成测试跑通（integration.test.js, 194 行）

### Iteration 3: 管理后台 ✅
- [x] Vue 3 + Element Plus + Vite
- [x] Templates 页面（课程模板管理）
- [x] Sessions 页面（排课）
- [x] SessionBookings 页面（预约名单查看）
- [x] Axios + Basic Auth + API 代理

### Iteration 4: 微信小程序 ✅
- [x] 课表页（日期选择 + 课程列表）
- [x] 课程详情页（预约/确认）
- [x] 我的预约页（列表 + 取消）
- [x] API 对接（utils/api.js）

### 部署 ✅
- [x] 购买服务器
- [x] GitHub 代码拉取到服务器
- [x] PM2 启动后端服务（pm2 save 持久化）

---

## 进行中

### 生产环境配置
- [x] 域名购买（hongbeyuan.cn，腾讯云）
- [x] DNS 解析配置（api.hongbeyuan.cn + admin.hongbeyuan.cn → 106.53.70.74，DNSPod）
- [x] 轻量服务器域名绑定（api.hongbeyuan.cn + admin.hongbeyuan.cn，腾讯云控制台）
- [x] Nginx 反向代理配置（api → localhost:3000，admin → 静态文件）
- [x] 环境变量配置（.env：JWT_SECRET、ADMIN_PASS、WX_APPID、WX_SECRET）
- [x] PM2 用 --env-file=.env 重启，后端进入正式模式
- [ ] 域名 ICP 备案审批中（已提交，等待通过，约 7-20 天）
- [ ] SSL 证书（备案通过后在腾讯云控制台申请免费证书）
- [ ] 小程序 `utils/api.js` 中 baseURL 改为 `https://api.hongbeyuan.cn`
- [ ] 管理后台构建（npm run build）并用 Nginx 托管静态文件

---

## 上线流程（完整步骤）

### 第零步：小程序主体（当前保持个人主体）
1. 当前小程序是**个人主体**注册的，MVP 阶段保持个人主体即可
2. 个人主体限制（不影响 MVP）：
   - 不支持微信支付（MVP 不涉及支付，无影响）
   - 商业服务类目受限（需选择合适的个人可用类目）
3. **后续拿到营业执照后**，再注册企业主体小程序账号并迁移：
   - 新账号会有**新的 AppID 和 AppSecret**
   - 代码不用重写，只需更换后端环境变量中的 `WX_APPID` 和 `WX_SECRET`
   - 注册需要：营业执照、法人身份证、法人微信扫码验证
   - 注册地址：[微信公众平台](https://mp.weixin.qq.com) → 立即注册 → 小程序

### 第一步：域名购买与备案
1. 在域名商（阿里云/腾讯云/华为云）购买域名
2. 提交 ICP 备案（国内服务器必须备案，审批周期 7-20 天）
3. 备案期间可以先做后续配置准备，但域名不能正式对外使用

### 第二步：DNS 解析
1. 在域名管理后台添加 A 记录，指向服务器公网 IP
2. 建议配置：
   - `api.你的域名.com` → 服务器 IP（后端 API）
   - `admin.你的域名.com` → 服务器 IP（管理后台，可选）
3. 等待 DNS 生效（通常几分钟到 48 小时）

### 第三步：Nginx 反向代理
1. 服务器安装 Nginx：`sudo apt install nginx`（Ubuntu）或 `sudo yum install nginx`（CentOS）
2. 配置反向代理：
   - `api.你的域名.com:443` → `localhost:3000`（后端 API）
   - `admin.你的域名.com:443` → 管理后台静态文件（`admin/dist/`）
3. 先用 HTTP (80) 测试通，再配 HTTPS

### 第四步：SSL 证书
1. 安装 certbot：`sudo apt install certbot python3-certbot-nginx`
2. 申请证书：`sudo certbot --nginx -d api.你的域名.com -d admin.你的域名.com`
3. certbot 会自动修改 Nginx 配置，启用 HTTPS + 自动续期
4. 验证：浏览器访问 `https://api.你的域名.com` 看到小锁

### 第五步：代码配置更新
1. 小程序 `miniapp/utils/api.js` — baseURL 改为 `https://api.你的域名.com`
2. 管理后台 `admin/vite.config.js` — 生产构建时 API 地址更新
3. 后端环境变量配置（`.env` 文件）：
   - `WX_APPID=你的AppID`
   - `WX_SECRET=你的AppSecret`
   - `JWT_SECRET=一个随机长字符串`
   - `ADMIN_PASSWORD=改掉默认密码`
4. 管理后台构建：`cd admin && npm run build`，将 `dist/` 目录交给 Nginx 托管

### 第六步：微信小程序配置
1. 登录 [微信公众平台](https://mp.weixin.qq.com)
2. 「开发管理」→「开发设置」→「服务器域名」
3. 添加 request 合法域名：`https://api.你的域名.com`
4. 域名必须已备案 + HTTPS，否则添加不上

### 第七步：小程序提审上线
1. 微信开发者工具中上传代码
2. 微信公众平台提交审核
3. 审核通过后发布

### 注意事项
- **备案是最大卡点**，建议域名买好后第一时间提交
- 备案期间可以先做 Nginx/SSL 配置（用 IP 直接访问测试）
- 微信小程序严格要求 HTTPS，不支持 HTTP 和 IP 直连
- certbot 证书 90 天自动续期，确认 cron job 正常运行

---

## 未开始 / 后续优化

- [ ] 微信小程序提审上线（需域名备案 + HTTPS + 微信后台配置服务器域名）
- [ ] 数据库备份策略（SQLite 文件定时拷贝）
- [ ] 签到（CHECKED_IN）路由补充
- [ ] **小程序主体迁移（个人→企业）**：拿到营业执照后注册企业主体小程序，更新 AppID/AppSecret
- [ ] **域名备案主体变更（个人→企业）**：拿到营业执照后将备案主体转为企业
- [ ] 候补 / 次卡 / 会员等高级功能（非 MVP）

---

## 关键决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-11 | 技术栈: Node.js + Express + better-sqlite3 | MVP 零运维，单文件数据库 |
| 2026-02-11 | PM2 管理后端进程 | 服务器 24 小时运行，自动重启 |
| 2026-02-11 | 服务器已购买，代码已部署 | 准备上线 |
| 2026-02-11 | 备案类型：先个人备案，后续转企业 | 暂无营业执照，个人备案即可支持 MVP 免费预约功能 |
| 2026-02-11 | 域名在腾讯云购买 | 和服务器同平台，方便备案流程 |
| 2026-02-11 | 小程序主体：先保持个人主体，后续转企业 | 暂无营业执照，MVP 不涉及支付，个人主体足够；拿到执照后再迁移 |

---

## 服务器 / 部署信息

- **域名**: hongbeyuan.cn（备案中）
- **服务器 IP**: 106.53.70.74（腾讯云，Ubuntu）
- **后端端口**: 3000（PM2 管理，node --env-file=.env 启动）
- **管理后台开发端口**: 5173（生产需 build 后 Nginx 托管）
- **Admin 账号**: 已通过 .env 配置（不再使用默认硬编码密码）
- **代码路径（服务器）**: /home/yoga/
- **代码来源**: GitHub 仓库 → 服务器 git pull
- **Nginx 配置**: /etc/nginx/sites-available/yoga-api 和 yoga-admin
- **DNS 解析**: api.hongbeyuan.cn / admin.hongbeyuan.cn → 106.53.70.74（DNSPod）
- **微信登录模式**: .env 已配置 WX_APPID 和 WX_SECRET，备案通过 + HTTPS 配好后即为正式模式

---

## 上次会话摘要

**会话日期**: 2026-02-11（第五次会话）
**做了什么**:
- 购买域名 hongbeyuan.cn（腾讯云）
- 配置 DNS 解析：api.hongbeyuan.cn + admin.hongbeyuan.cn → 106.53.70.74
- 服务器安装 Nginx 1.18.0（Ubuntu），配置反向代理（api → 3000 端口，admin → 静态文件）
- 创建 /home/yoga/backend/.env 文件（JWT_SECRET、ADMIN_PASS、WX_APPID、WX_SECRET）
- PM2 用 --env-file=.env 重启后端，进入正式配置模式
- 提交域名 ICP 备案（网站/域名类型，个人主体）
- 生成小程序 AppSecret 并配置到服务器 .env

**下次应继续**:
1. 等待 ICP 备案通过（约 7-20 天）
2. 备案通过后：安装 certbot，配置 SSL 证书（HTTPS）
3. 管理后台构建（npm run build），Nginx 托管静态文件
4. 小程序 baseURL 改为 https://api.hongbeyuan.cn
5. 微信公众平台添加服务器域名
6. 小程序选择合适的个人可用类目，提审上线

**注意事项**:
- 微信小程序必须 HTTPS 才能正常请求后端 API
- 备案是最大卡点，SSL 证书需要备案通过后才能正式启用
- .env 文件只在服务器上，不要提交到 GitHub
- 后续拿到营业执照后需做两件事：① 备案主体变更 ② 注册企业主体小程序并更新 AppID/AppSecret
