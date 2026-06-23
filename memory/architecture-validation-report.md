---
name: architecture-validation-report
description: 用户系统与防丢功能架构验证报告
metadata:
  type: project
  created: 2026-06-22
---

# Cyber-Pendant 架构验证报告

> 文档状态：历史架构验证报告。本文验证的是 2026-06-22 的用户系统与防丢设计方案，部分“未实现”结论已经被当前代码追上。当前事实请优先阅读 [current-system-state.md](current-system-state.md)。

**验证日期**: 2026-06-22
**验证范围**: 用户系统与防丢功能设计（5 阶段实施计划）

---

## 一、微信登录流程验证 ✅

### 1.1 API 设计验证

#### 设计方案
```
POST /api/auth/wechat/login
请求: { code, encryptedData?, iv? }
响应: { token, user, isNewUser }
```

#### 微信官方要求
根据 [微信小程序开放文档](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html)：

- **端点**: `POST https://api.weixin.qq.com/sns/jscode2session`
- **参数**: appid, secret, js_code, grant_type=authorization_code
- **返回**: openid, session_key, unionid (可选)

#### 验证结论
✅ **设计正确**，但需补充说明：

| 项目 | 设计方案 | 验证结果 |
|------|----------|----------|
| 前端调用 wx.login() | ✅ 有 | 正确 |
| 后端用 code 换 openid | ✅ 有 | 正确 |
| 创建/查询 users 记录 | ✅ 有 | 正确 |
| 返回自定义 token | ✅ 有 | 正确 |
| session_key 存储 | ⚠️ 未提及 | **需补充** |

#### 建议补充

```javascript
// session_key 存储建议
// 1. 不需要长期存储（微信会过期）
// 2. 如需解密手机号，临时使用后即丢弃
// 3. 或加密存储在 users 表：
ALTER TABLE users ADD COLUMN encrypted_session_key TEXT;  -- AES 加密存储
```

### 1.2 Token 设计验证

#### 设计方案
```javascript
// 用户 token (30 天)
const USER_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

// Payload
{
  sub: "user_123",    // user ID
  type: "user",       // 区分 admin token
  openid: "wx_xyz...",
  iat: 1718000000,
  exp: 1720592000
}
```

#### 验证结论
✅ **设计合理**

| 最佳实践 | 设计方案 | 验证结果 |
|----------|----------|----------|
| 只存储必要信息 | ✅ 只存 sub, type, openid | 符合 |
| 不存敏感业务数据 | ✅ bindingCount 等实时查 | 符合 |
| 使用 exp 过期 | ✅ 有 exp 字段 | 符合 |
| 使用 type 区分 | ✅ type: "user"/"admin" | 符合 |

#### 潜在改进
⚠️ **建议**: 考虑添加 `jti` (JWT ID) 用于令牌撤销机制

---

## 二、数据库架构验证 ✅

### 2.1 表结构设计

#### users 表
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openid TEXT NOT NULL UNIQUE,        -- ✅ 正确：唯一索引
  unionid TEXT,                       -- ✅ 可选：开放平台统一
  nickname TEXT,
  avatar_url TEXT,
  phone TEXT,
  phone_verified_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- ✅ 支持封禁
  banned_at TEXT,
  banned_reason TEXT,
  binding_count INTEGER NOT NULL DEFAULT 0,
  lost_report_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);
```

**验证结论**: ✅ **设计合理**

- ✅ openid UNIQUE 约束正确
- ✅ 索引设计合理（idx_users_openid, idx_users_unionid）
- ✅ 封禁机制完整（status + banned_at + banned_reason）
- ⚠️ **建议**: 添加 `deleted_at` 支持软删除（GDPR 合规）

#### binding_logs 表
```sql
CREATE TABLE binding_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garment_id INTEGER NOT NULL REFERENCES garments(id),
  garment_sn TEXT NOT NULL,           -- ✅ 冗余 SN，便于查询
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,               -- ✅ bind/unbind/modify
  ip_address TEXT,
  user_agent TEXT,
  before_data TEXT,                   -- ✅ JSON 快照
  after_data TEXT,
  changed_fields TEXT,                -- ✅ JSON 字段列表
  created_at TEXT NOT NULL
);
```

**验证结论**: ✅ **设计优秀**

- ✅ 外键关系正确
- ✅ 数据快照设计完善（支持审计追溯）
- ✅ 索引覆盖查询场景
- ✅ 支持 NULL user_id（管理员操作）

#### lost_reports 表
```sql
CREATE TABLE lost_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garment_id INTEGER NOT NULL REFERENCES garments(id),
  garment_sn TEXT NOT NULL,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  report_time TEXT NOT NULL,
  found_time TEXT,
  note TEXT,
  found_note TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  view_count INTEGER NOT NULL DEFAULT 0,
  contact_reveal_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**验证结论**: ✅ **设计合理**

- ✅ 状态机设计（active/found/cancelled）
- ✅ 统计字段完整（view_count, contact_reveal_count）
- ✅ 支持找回流程（found_time, found_note）
- ⚠️ **建议**: 添加 `expires_at` 实现 30 天自动过期

### 2.2 外键关系图

```
users (1) ----< (N) binding_logs
  |                   |
  |                (N) ----> garments (1) ──┐
  |                                        |
  +---------------< (N)                    |
   bound_by_user_id                      |
                                           |
lost_reports (1) ----< (N) binding_logs   |
        |                                  |
        +---------------- bound ───────────> garments (1)
                    lost_report_id
```

**验证结论**: ✅ **关系清晰合理**

### 2.3 索引设计验证

| 索引 | 用途 | 验证结果 |
|------|------|----------|
| idx_users_openid | 微信登录查询 | ✅ 必须 |
| idx_users_unionid | 开放平台关联 | ✅ 可选但推荐 |
| idx_users_phone | 手机号查询 | ✅ 需要 |
| idx_users_status | 封禁用户查询 | ✅ 需要 |
| idx_binding_logs_garment | 查询 SN 绑定历史 | ✅ 必须 |
| idx_binding_logs_user | 查询用户操作历史 | ✅ 必须 |
| idx_binding_logs_created | 时间范围查询 | ✅ 推荐 |
| idx_lost_reports_garment | 查询 SN 丢失状态 | ✅ 必须 |
| idx_lost_reports_reporter | 查询用户报告 | ✅ 必须 |
| idx_lost_reports_status | 查询有效报告 | ✅ 必须 |
| idx_garments_bound_by | 查询用户绑定列表 | ✅ 必须 |
| idx_garments_lost_report | 查询丢失衣服 | ✅ 必须 |

**验证结论**: ✅ **索引设计完整**

### 2.4 并发控制设计

#### 方案
```javascript
// 数据库层面约束
UPDATE garments
SET bound_by_user_id = ?, ...
WHERE sn = ? AND bound_by_user_id IS NULL;

// 检查 changes
if (result.changes === 0) {
  throw new HttpError(409, '该吊牌已被绑定');
}
```

**验证结论**: ✅ **方案正确**

- ✅ WHERE 条件防止并发绑定
- ✅ 事务处理确保原子性
- ✅ 检查 changes 行数判断结果

---

## 三、安全设计验证 ✅

### 3.1 零信任原则验证

根据 [security-principles.md](security-principles.md) 的原则验证：

| 原则 | 设计实现 | 验证结果 |
|------|----------|----------|
| 身份验证（服务端） | ✅ 从 Token 解析 user_id | 符合 |
| 权限检查（数据库） | ✅ 查询 garment.bound_by_user_id | 符合 |
| 输入验证（服务端） | ✅ normalizeBindingInput() | 符合 |
| 数据脱敏（DTO） | ✅ toGarmentDto() 控制返回 | 符合 |
| 操作审计 | ✅ binding_logs 记录 | 符合 |
| 防刷限流 | ✅ checkRateLimit() | 符合 |

**验证结论**: ✅ **完全符合零信任原则**

### 3.2 数据脱敏策略验证

| 场景 | 设计方案 | 验证结果 |
|------|----------|----------|
| 正常查询（公开） | 姓名：张**，电话尾号：8000 | ✅ 正确 |
| 丢失状态 | 完整联系方式 | ✅ 正确（设计目的） |
| 管理员 | 始终完整 | ✅ 正确 |
| 绑定者本人 | 始终完整 | ✅ 正确 |

**验证结论**: ✅ **脱敏策略合理，符合产品目标**

### 3.3 防刷机制设计

```javascript
// 设计方案
1. IP 限流：单 IP 每分钟最多查询 100 次
2. SN 限流：单 SN 每分钟最多查询 20 次
3. 联系方式曝光限流：单设备每小时最多查看 10 次
```

**验证结论**: ✅ **方案合理**，但需考虑实现方式

⚠️ **建议**: 当前设计使用内存存储限流计数，重启后丢失。建议：
- 短期：内存 + 定期清理可接受
- 长期：Redis 或数据库持久化

### 3.4 边界安全验证

| 边界情况 | 设计处理 | 验证结果 |
|----------|----------|----------|
| 并发绑定同一 SN | WHERE bound_by_user_id IS NULL | ✅ 正确 |
| 绑定者解绑 | 检查 bound_by_user_id == user_id | ✅ 正确 |
| 非绑定者报告丢失 | 权限检查 | ✅ 正确 |
| 重复报告丢失 | 检查 lost_report_id | ✅ 正确 |
| 恶意批量绑定 | 单用户限制 + 限流 | ✅ 有考虑 |

---

## 四、发现的问题与建议 ⚠️

### 4.1 高优先级问题

#### 问题 1: session_key 处理未明确
**位置**: 微信登录流程
**问题**: 未说明 session_key 如何存储和使用
**影响**: 无法实现手机号解密功能
**建议**:
```sql
-- 方案 A：临时使用（推荐）
-- 不存储 session_key，收到后立即解密手机号，然后丢弃

-- 方案 B：加密存储
ALTER TABLE users ADD COLUMN encrypted_session_key TEXT;
```

#### 问题 2: 限流机制实现未明确
**位置**: 阶段 5 - 防刷机制
**问题**: 未指定限流计数器存储方式
**建议**:
```javascript
// 推荐方案：内存 + SQLite 混合
// 短期限流（1分钟）：内存
// 长期限流（1小时）：SQLite 表

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,   -- "ip:query:123.45.67.89"
  count INTEGER NOT NULL,
  window_start TEXT NOT NULL
);
```

#### 问题 3: 丢失报告自动过期未实现
**位置**: 阶段 5 - 恶意报告丢失防护
**问题**: 设计提到"30 天自动过期"但未在表结构体现
**建议**:
```sql
-- 添加过期字段
ALTER TABLE lost_reports ADD COLUMN expires_at TEXT;

-- 查询时过滤
WHERE status = 'active' AND (expires_at IS NULL OR expires_at > datetime('now'))
```

### 4.2 中优先级建议

#### 建议 1: 添加软删除支持
**原因**: GDPR 合规，用户有权要求删除数据
**建议**:
```sql
ALTER TABLE users ADD COLUMN deleted_at TEXT;
CREATE INDEX idx_users_deleted ON users(deleted_at);
```

#### 建议 2: 添加 JWT jti 支持
**原因**: 支持令牌撤销（如用户修改密码后使旧 token 失效）
**建议**:
```sql
CREATE TABLE token_blacklist (
  jti TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);

-- token payload 添加
{ ..., jti: "unique_token_id" }
```

#### 建议 3: 绑定数量限制的数据库约束
**原因**: 防止恶意批量绑定
**建议**:
```javascript
// 应用层检查
function checkBindingLimit(db, userId, limit = 50) {
  const count = db.prepare(
    'SELECT COUNT(*) FROM garments WHERE bound_by_user_id = ?'
  ).get(userId);
  if (count >= limit) {
    throw new HttpError(429, '您已达到最大绑定数量');
  }
}
```

### 4.3 低优先级优化

#### 优化 1: binding_logs 数据归档
**原因**: 日志表会无限增长
**建议**: 添加定期归档任务（如 1 年前的日志移到历史表）

#### 优化 2: 添加缓存层
**原因**: 高频查询（SN 查询）可缓存
**建议**: 使用 Redis 或内存缓存热门 SN

---

## 五、架构逻辑验证 ✅

### 5.1 业务流程逻辑

#### 正常绑定流程
```
用户微信登录 → 获得 token → 扫描 SN → 点击绑定 → 填写信息 → 后端验证 → 数据库事务 → 返回成功
```
**验证**: ✅ 逻辑完整，环环相扣

#### 防丢流程
```
失主：登录 → 我的衣服 → 报告丢失 → 填写信息 → 提交
拾获者：扫描 SN → 看到丢失横幅 → 点击查看联系方式 → 显示完整电话
```
**验证**: ✅ 逻辑符合预期，实现防丢目标

#### 解绑/换绑流程
```
用户 A 解绑 → bound_by_user_id 变为 NULL → 用户 B 可绑定
```
**验证**: ✅ 逻辑正确

### 5.2 权限模型验证

| 操作 | 需要登录 | 权限要求 | 验证结果 |
|------|----------|----------|----------|
| 绑定衣服 | ✅ | 任何用户 | ✅ 正确 |
| 解绑衣服 | ✅ | 绑定者本人或管理员 | ✅ 正确 |
| 修改绑定信息 | ✅ | 绑定者本人 | ✅ 正确 |
| 报告丢失 | ✅ | 绑定者本人 | ✅ 正确 |
| 取消报失 | ✅ | 报告人本人 | ✅ 正确 |
| 查看联系方式 | ❌ | 任何人（丢失时） | ✅ 正确 |
| 查询 SN | ❌ | 任何人 | ✅ 正确 |

**验证结论**: ✅ **权限模型清晰合理**

### 5.3 数据流向验证

```
┌─────────────────────────────────────────────────────────────┐
│                        数据流向图                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  微信服务器 ──code──> 后端 ──openid──> users 表              │
│     │                                                   │    │
│     └──session_key──> 后端 (临时使用) ──phone──> users 表   │
│                                                             │
│  用户 ──token──> 后端 ──user_id──> garments.bound_by_user_id │
│                                       │                    │
│  绑定操作 ──> binding_logs <──────────┘                    │
│                                                             │
│  报告丢失 ──> lost_reports ──> garments.lost_report_id      │
│                                       │                    │
│  丢失查询 ──> 完整联系方式 <──────────┘                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**验证结论**: ✅ **数据流向清晰，无循环依赖**

---

## 六、与现有系统集成验证 ✅

### 6.1 现有代码兼容性

| 模块 | 现有实现 | 新设计影响 | 验证结果 |
|------|----------|------------|----------|
| auth.js | PBKDF2 + JWT (admin) | 需添加用户 JWT | ✅ 兼容 |
| db.js | 三层数据模型 | 需添加表迁移 | ✅ 兼容 |
| api.js | requireAdmin() | 需添加 requireUser() | ✅ 兼容 |
| 前端绑定 API | 无鉴权 | 需添加登录检查 | ⚠️ 需改动 |

### 6.2 向后兼容性

**问题**: 现有绑定数据没有 `bound_by_user_id`

**解决方案**（已在设计中考虑）:
```sql
-- 迁移策略
-- 1. 新字段允许 NULL
ALTER TABLE garments ADD COLUMN bound_by_user_id INTEGER REFERENCES users(id);

-- 2. 旧数据保持 NULL（表示未迁移的绑定）
-- 3. 用户重新绑定后才会设置 user_id

-- 或者：管理员标记为绑定者
UPDATE garments
SET bound_by_user_id = ?
WHERE owner_bound_at IS NOT NULL AND bound_by_user_id IS NULL;
```

**验证**: ✅ **向后兼容，新旧数据可共存**

---

## 七、实施建议 📋

### 7.1 实施顺序验证

设计的 5 个阶段顺序是合理的：

```
阶段1: 用户系统 ──> 基础设施
      │
      v
阶段2: 绑定鉴权 ──> 依赖用户登录
      │
      v
阶段3: 防丢功能 ──> 依赖绑定鉴权
      │
      v
阶段4: 用户中心 ──> 依赖前面所有功能
      │
      v
阶段5: 完善优化 ──> 锦上添花
```

**验证结论**: ✅ **依赖关系清晰，顺序合理**

### 7.2 关键里程碑

| 阶段 | 关键交付 | 验收标准 |
|------|----------|----------|
| 1 | 微信登录 + users 表 | 能登录并返回 token |
| 2 | 绑定需登录 + bound_by_user_id | 未登录不能绑定 |
| 3 | 报告丢失 + 丢失时显示联系方式 | 拾获者能看到电话 |
| 4 | 用户中心 + TabBar | 能看到"我的衣服"列表 |
| 5 | 限流 + 完整测试 | 通过所有测试用例 |

### 7.3 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 微信 API 变更 | 低 | 高 | 使用稳定 API，关注官方公告 |
| 并发绑定冲突 | 中 | 中 | 数据库约束已处理 |
| 限流误伤正常用户 | 中 | 低 | 合理设置阈值 |
| 旧数据迁移问题 | 低 | 中 | 允许 NULL，渐进迁移 |

---

## 八、总结 ✅

### 8.1 整体评价

**设计质量**: ⭐⭐⭐⭐⭐ (5/5)

| 维度 | 评分 | 说明 |
|------|------|------|
| 架构合理性 | ⭐⭐⭐⭐⭐ | 三层数据模型 + 外键关系清晰 |
| 安全性 | ⭐⭐⭐⭐⭐ | 零信任原则，所有验证在服务端 |
| 可扩展性 | ⭐⭐⭐⭐☆ | 模块化设计，易于扩展 |
| 可维护性 | ⭐⭐⭐⭐⭐ | 审计日志完善，便于排查问题 |
| 用户体验 | ⭐⭐⭐⭐☆ | 流程简洁，符合预期 |

### 8.2 核心优势

1. ✅ **安全优先**: 从零信任原则出发设计
2. ✅ **数据完整**: binding_logs 提供完整审计
3. ✅ **产品导向**: 防丢功能设计符合实际使用场景
4. ✅ **向后兼容**: 新旧数据可平滑迁移

### 8.3 需要注意的点

1. ⚠️ **session_key 处理**: 需明确存储策略
2. ⚠️ **限流实现**: 需确定存储方式（内存 vs 数据库）
3. ⚠️ **自动过期**: 需在表结构中添加 expires_at

### 8.4 最终结论

**该设计方案架构合理、逻辑清晰、安全性高，可以开始实施。**

建议优先解决 3 个高优先级问题，然后按 5 个阶段依次实施。

---

**验证人**: Claude
**验证日期**: 2026-06-22
**文档版本**: 1.0
