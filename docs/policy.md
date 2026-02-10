# 取消规则 (Cancellation Policy)

## MVP 版本

### 默认规则
- **占位 TTL**：`hold_ttl_minutes = 10`（HOLD 状态 10 分钟后自动过期）
- **免费取消窗口**：`cancel_free_before_minutes = 240`（开课前 4 小时内取消标记为 LATE_CANCEL）
- **最大同时预约**：`max_active_bookings = 3`（同一用户最多同时持有 3 个活跃预约）

### 取消行为
- **开课前 4 小时以上取消**：免费取消，回滚库存，`cancel_reason = USER_CANCEL`
- **开课前 4 小时以内取消**：仍允许取消，回滚库存，`cancel_reason = LATE_CANCEL`（将来可扣费）
- **HOLD 超时**：自动标记 `cancel_reason = EXPIRED`，不占库存

### 规则覆盖
Policy 支持按课程模板 (template_id) 覆盖。查找顺序：
1. 模板专属规则
2. 全局默认规则
3. 硬编码兜底值
