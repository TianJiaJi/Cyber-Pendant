---
name: detailed-logic-design
description: 用户系统与防丢功能详细逻辑设计
metadata:
  type: project
---

# Cyber-Pendant 详细逻辑设计

> 文档状态：历史详细设计稿。用户表、绑定日志、丢失报告、用户 token、用户中心和后台用户管理等核心方向已经落地，但字段、接口细节和产品取舍以当前源码为准。当前事实索引见 [current-system-state.md](current-system-state.md)。

## 一、用户体系设计

### 1.1 用户表结构

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 微信身份信息
  openid TEXT NOT NULL UNIQUE,              -- 小程序 openid（必须唯一）
  unionid TEXT,                             -- 开放平台 unionid（多应用统一）

  -- 用户资料
  nickname TEXT,                            -- 微信昵称
  avatar_url TEXT,                          -- 头像 URL
  phone TEXT,                               -- 手机号（需用户授权，可为空）
  phone_verified_at TEXT,                    -- 手机号验证时间

  -- 状态字段
  status TEXT NOT NULL DEFAULT 'active',    -- active / banned
  banned_at TEXT,                           -- 封禁时间
  banned_reason TEXT,                       -- 封禁原因

  -- 统计字段
  binding_count INTEGER NOT NULL DEFAULT 0, -- 绑定衣服数量
  lost_report_count INTEGER NOT NULL DEFAULT 0, -- 报告丢失数量

  -- 时间戳
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT                        -- 最后登录时间
);

CREATE INDEX idx_users_openid ON users(openid);
CREATE INDEX idx_users_unionid ON users(unionid);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_status ON users(status);
```

### 1.2 绑定日志表

```sql
CREATE TABLE binding_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 关联信息
  garment_id INTEGER NOT NULL REFERENCES garments(id),
  garment_sn TEXT NOT NULL,                 -- 冗余 SN，方便查询
  user_id INTEGER REFERENCES users(id),    -- 操作用户（NULL 表示管理员操作）

  -- 操作信息
  action TEXT NOT NULL,                     -- bind / unbind / modify / admin_unbind
  ip_address TEXT,                          -- 操作 IP
  user_agent TEXT,                          -- 用户代理

  -- 数据快照（JSON 格式）
  before_data TEXT,                         -- 操作前的绑定信息
  after_data TEXT,                          -- 操作后的绑定信息

  -- 变更字段（JSON 格式）
  changed_fields TEXT,                      -- ["student_name", "contact_phone"]

  -- 时间戳
  created_at TEXT NOT NULL
);

CREATE INDEX idx_binding_logs_garment ON binding_logs(garment_id);
CREATE INDEX idx_binding_logs_user ON binding_logs(user_id);
CREATE INDEX idx_binding_logs_sn ON binding_logs(garment_sn);
CREATE INDEX idx_binding_logs_created ON binding_logs(created_at);
```

### 1.3 丢失报告表

```sql
CREATE TABLE lost_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 关联信息
  garment_id INTEGER NOT NULL REFERENCES garments(id),
  garment_sn TEXT NOT NULL,                 -- 冗余 SN
  reporter_id INTEGER NOT NULL REFERENCES users(id), -- 报告人（通常是绑定的用户）

  -- 报告信息
  report_time TEXT NOT NULL,                -- 报告时间
  found_time TEXT,                          -- 找回时间（NULL 表示未找回）
  note TEXT,                                -- 备注信息（丢失地点、特征等）
  found_note TEXT,                          -- 找回备注

  -- 状态
  status TEXT NOT NULL DEFAULT 'active',    -- active / found / cancelled

  -- 查看记录（用于统计多少人看到过）
  view_count INTEGER NOT NULL DEFAULT 0,    -- 页面查看次数
  contact_reveal_count INTEGER NOT NULL DEFAULT 0, -- 联系方式曝光次数

  -- 时间戳
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_lost_reports_garment ON lost_reports(garment_id);
CREATE INDEX idx_lost_reports_reporter ON lost_reports(reporter_id);
CREATE INDEX idx_lost_reports_status ON lost_reports(status);
```

### 1.4 修改 garments 表

```sql
-- 新增字段
ALTER TABLE garments ADD COLUMN bound_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE garments ADD COLUMN lost_report_id INTEGER REFERENCES lost_reports(id);
ALTER TABLE garments ADD COLUMN binding_verified_at TEXT; -- 绑定信息确认时间（可选功能）

CREATE INDEX idx_garments_bound_by ON garments(bound_by_user_id);
CREATE INDEX idx_garments_lost_report ON garments(lost_report_id);
```

---

## 二、微信登录流程

### 2.1 登录时序图

```
┌─────────┐                  ┌─────────┐                  ┌─────────┐
│  小程序  │                  │  后端   │                  │ 微信服务器 │
└────┬────┘                  └────┬────┘                  └────┬────┘
     │                            │                            │
     │ 1. wx.login()             │                            │
     ├──────────────────────────→│                            │
     │    获得 code               │                            │
     │                            │                            │
     │ 2. POST /api/auth/wechat/login │                       │
     │    { code }                │                            │
     ├──────────────────────────→│                            │
     │                            │ 3. 用 code 换 session_key │
     │                            │    (appid + secret)       │
     │                            ├──────────────────────────→│
     │                            │                            │
     │                            │ 4. 返回 openid + session_key │
     │                            │←──────────────────────────┤
     │                            │                            │
     │                            │ 5. 查询/创建 users 记录     │
     │                            │                            │
     │ 6. 返回 token + user       │                            │
     │←──────────────────────────┤                            │
     │                            │                            │
     │ 7. 存储到 localStorage     │                            │
     │    后续请求带上 Authorization │                       │
     │                            │                            │
```

### 2.2 登录 API 设计

**端点**：`POST /api/auth/wechat/login`

**请求参数**：
```json
{
  "code": "wx_login_code",
  "encryptedData": "encrypted_phone_data",  // 可选，获取手机号
  "iv": "initialization_vector"              // 可选，配合 encryptedData
}
```

**响应**：
```json
{
  "token": "base64url_encoded_jwt",
  "user": {
    "id": 123,
    "openid": "wx_xyz...",
    "nickname": "微信用户",
    "avatarUrl": "https://...",
    "phone": "138****1234",  // 脱敏显示
    "bindingCount": 0,
    "lostReportCount": 0
  },
  "isNewUser": false
}
```

**错误响应**：
```json
// code 无效
{ "message": "微信授权码无效" }

// 用户被封禁
{ "message": "账号已被封禁，请联系客服", "bannedReason": "...", "bannedAt": "..." }
```

### 2.3 Token 设计

与现有的 admin token 类似，但用户 token TTL 可以更长：

```javascript
// 用户 token: 30 天有效
const USER_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

// admin token: 7 天有效（保持不变）
const ADMIN_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
```

用户 token payload：
```json
{
  "sub": "user_123",       // user ID
  "type": "user",          // 区分 admin token
  "openid": "wx_xyz...",
  "iat": 1718000000,
  "exp": 1720592000
}
```

### 2.4 环境变量配置

新增 `server/.env` 配置：

```bash
# 微信小程序配置
WECHAT_APP_ID=wxXXXXXXXXXXXXXXXX
WECHAT_APP_SECRET=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# 前端用户 Token 配置
USER_TOKEN_SECRET=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX  # 与 admin 可不同
USER_TOKEN_TTL_DAYS=30
```

---

## 三、绑定操作流程

### 3.1 绑定前置检查

```
┌─────────────────────────────────────────────────────────────┐
│                        用户点击"立即绑定"                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  1. 检查是否登录                                              │
│     ├─ 未登录 → 跳转微信登录 → 登录成功后返回                 │
│     └─ 已登录 → 继续                                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  2. 检查 SN 状态                                              │
│     ├─ 不存在 → 提示"吊牌不存在"                               │
│     ├─ 已停用 → 提示"吊牌已停用，无法绑定"                      │
│     ├─ 已绑定 (bound_by_user_id != NULL) → 提示"已被 xxx 绑定" │
│     └─ 可绑定 → 显示绑定表单                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  3. 用户填写表单                                              │
│     - 学生姓名（必填，1-24 字符）                              │
│     - 学校（必填，1-80 字符）                                  │
│     - 班级（必填，1-40 字符）                                  │
│     - 联系人（可选，1-24 字符）                                │
│     - 联系电话（必填，6-20 位数字）                            │
│     - 手机号授权（可选，用于后续找回）                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  4. 提交绑定                                                  │
│     ├─ 表单验证                                               │
│     ├─ 再次检查 SN 状态（防止并发）                            │
│     ├─ 写入数据库（事务）                                      │
│     │   ├─ 更新 garments 表                                   │
│     │   ├─ 设置 bound_by_user_id                              │
│     │   ├─ 记录 binding_logs                                 │
│     │   └─ 更新用户 binding_count                            │
│     └─ 返回成功                                               │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 绑定 API 设计

**端点**：`POST /api/garments/{sn}/binding`

**鉴权**：需要 Bearer token（用户登录）

**请求参数**：
```json
{
  "studentName": "张三",
  "studentSchool": "第一实验学校",
  "studentClass": "三年级二班",
  "contactName": "张女士",
  "contactPhone": "13800138000",
  "phoneAuth": true  // 是否授权记录手机号到 users 表
}
```

**响应**：
```json
{
  "garment": {
    "sn": "CP20260615001",
    "isBound": true,
    "owner": {
      "name": "张**",
      "school": "第一实验学校",
      "className": "三年级二班",
      "phoneTail": "8000",
      "boundAt": "2026-06-18T10:30:00.000Z"
    }
  }
}
```

**错误响应**：
```json
// 401 - 未登录
{ "message": "请先登录" }

// 404 - SN 不存在
{ "message": "未找到该 SN 对应的吊牌信息" }

// 409 - 已被绑定
{
  "message": "该吊牌已被绑定",
  "boundBy": {
    "nickname": "微信用户",
    "boundAt": "2026-06-17T15:20:00.000Z"
  }
}

// 400 - 吊牌已停用
{ "message": "该吊牌已停用，不能绑定学生信息" }
```

### 3.3 解绑 API 设计

**端点**：`DELETE /api/garments/{sn}/binding`

**鉴权**：需要 Bearer token，且 token 对应用户必须是绑定的用户

**请求参数**：无

**响应**：
```json
{
  "garment": { "sn": "...", "isBound": false }
}
```

**错误响应**：
```json
// 403 - 不是绑定的用户
{ "message": "只有绑定的用户才能解绑" }

// 管理员可以强制解绑，不需要是绑定用户
```

### 3.4 修改绑定信息 API

**端点**：`PUT /api/garments/{sn}/binding`

**鉴权**：需要 Bearer token，且 token 对应用户必须是绑定的用户

**请求参数**：与绑定相同，支持部分更新

**响应**：与绑定相同

**副作用**：
- 创建 `binding_logs` 记录，`action = 'modify'`
- `changed_fields` 记录变更的字段列表

---

## 四、防丢功能流程

### 4.1 报告丢失流程

```
┌─────────────────────────────────────────────────────────────┐
│                   用户在"我的衣服"中点击"报告丢失"                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  1. 检查权限                                                  │
│     ├─ 未登录 → 跳转登录                                      │
│     ├─ 不是绑定的用户 → 提示"只有绑定者可以报告丢失"            │
│     └─ 已是丢失状态 → 提示"已报告丢失"                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  2. 显示报告丢失表单                                          │
│     - 丢失时间（默认当前时间）                                 │
│     - 丢失地点（可选）                                         │
│     - 备注信息（可选，如衣服特征）                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  3. 提交报告                                                  │
│     ├─ 创建 lost_reports 记录                                │
│     ├─ 更新 garments.lost_report_id                          │
│     ├─ 记录 binding_logs（action = 'report_lost'）           │
│     └─ 更新用户 lost_report_count                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  4. 返回成功，显示状态                                        │
│     - "已标记为丢失"                                          │
│     - "拾获者扫描时可以看到您的联系方式"                        │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 报告丢失 API

**端点**：`POST /api/garments/{sn}/report-lost`

**鉴权**：需要 Bearer token，且必须是绑定的用户

**请求参数**：
```json
{
  "lostTime": "2026-06-18T10:00:00.000Z",  // 可选，默认当前时间
  "location": "学校操场",                    // 可选
  "note": "蓝色外套，左胸前有校徽"           // 可选
}
```

**响应**：
```json
{
  "garment": {
    "sn": "CP20260615001",
    "isLost": true,
    "lostReport": {
      "id": 1,
      "reportTime": "2026-06-18T10:00:00.000Z",
      "location": "学校操场",
      "note": "蓝色外套，左胸前有校徽"
    }
  }
}
```

**错误响应**：
```json
// 403 - 不是绑定的用户
{ "message": "只有绑定该吊牌的用户才能报告丢失" }

// 409 - 已经是丢失状态
{ "message": "该吊牌已被标记为丢失" }
```

### 4.3 取消丢失报告 API

**端点**：`DELETE /api/garments/{sn}/report-lost`

**鉴权**：需要 Bearer token，且必须是报告人

**请求参数**：
```json
{
  "foundNote": "在学校食堂找到"  // 可选
}
```

**响应**：
```json
{
  "garment": {
    "sn": "...",
    "isLost": false
  }
}
```

**副作用**：
- 更新 `lost_reports` 状态为 `found`
- 设置 `found_time` 和 `found_note`
- 清空 `garments.lost_report_id`

### 4.4 查询吊牌 API（含丢失状态）

**端点**：`GET /api/garments/{sn}`

**参数**：
- `track`: 是否记录查询次数（默认 true）

**响应（正常状态）**：
```json
{
  "garment": {
    "sn": "CP20260615001",
    "status": "active",
    "productName": "高级梭织外套",
    // ... 其他衣服信息
    "isBound": true,
    "isLost": false,
    "owner": {
      "name": "张**",
      "school": "第一实验学校",
      "className": "三年级二班",
      "phoneTail": "8000"
    }
  }
}
```

**响应（丢失状态）**：
```json
{
  "garment": {
    "sn": "CP20260615001",
    "status": "active",
    "isBound": true,
    "isLost": true,
    "lostReport": {
      "reportTime": "2026-06-18T10:00:00.000Z",
      "location": "学校操场",
      "note": "蓝色外套，左胸前有校徽"
    },
    "owner": {
      "name": "张**",
      "school": "第一实验学校",
      "className": "三年级二班"
    }
  },
  "contactInfo": {           // ← 丢失时才返回
    "contactName": "张女士",
    "contactPhone": "13800138000",
    "revealToken": "abc123", // 用于统计曝光次数
    "message": "此衣服已报失，请拨打以下电话联系失主"
  }
}
```

**注意**：`contactInfo` 只在 `isLost = true` 时返回，且需要前端用户主动点击"查看联系方式"才显示。

### 4.5 联系方式曝光统计

**端点**：`POST /api/garments/{sn}/contact-reveal`

**鉴权**：不需要（但需要防刷）

**请求参数**：
```json
{
  "revealToken": "abc123"  // 从查询吊牌接口获得
}
```

**副作用**：
- 更新 `lost_reports.contact_reveal_count`
- 记录日志（可选，用于防刷）

**响应**：
```json
{ "ok": true }
```

---

## 五、用户中心功能

### 5.1 我的衣服列表

**端点**：`GET /api/user/garments`

**鉴权**：需要 Bearer token

**参数**：
- `page`: 页码（默认 1）
- `limit`: 每页数量（默认 20）
- `status`: 状态过滤（all / bound / lost）

**响应**：
```json
{
  "garments": [
    {
      "sn": "CP20260615001",
      "productName": "高级梭织外套",
      "color": "石墨黑",
      "size": "M",
      "isBound": true,
      "isLost": true,
      "boundAt": "2026-06-15T10:00:00.000Z",
      "owner": {
        "name": "张**",
        "school": "第一实验学校",
        "className": "三年级二班"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5
  }
}
```

### 5.2 我的丢失报告

**端点**：`GET /api/user/lost-reports`

**鉴权**：需要 Bearer token

**响应**：
```json
{
  "reports": [
    {
      "id": 1,
      "garment": {
        "sn": "CP20260615001",
        "productName": "高级梭织外套"
      },
      "reportTime": "2026-06-18T10:00:00.000Z",
      "location": "学校操场",
      "status": "active",  // active / found / cancelled
      "viewCount": 15,
      "contactRevealCount": 3
    }
  ]
}
```

### 5.3 绑定历史

**端点**：`GET /api/user/binding-logs`

**鉴权**：需要 Bearer token

**参数**：
- `sn`: 过滤特定 SN

**响应**：
```json
{
  "logs": [
    {
      "id": 1,
      "action": "bind",
      "garmentSn": "CP20260615001",
      "garmentName": "高级梭织外套",
      "beforeData": null,
      "afterData": {
        "studentName": "张三",
        "studentSchool": "第一实验学校"
      },
      "ipAddress": "123.45.67.89",
      "createdAt": "2026-06-18T10:00:00.000Z"
    }
  ]
}
```

---

## 六、前端页面交互设计

### 6.1 首页（查询页）

**现状**：
- 输入框（输入 SN 或扫描二维码）
- "查询吊牌"按钮

**新增**：
- 顶部导航栏（新增"我的"入口）
- 底部 TabBar（首页 / 我的）

### 6.2 吊牌详情页

**现状**：
- 显示衣服信息
- 绑定表单

**新增**：
- 丢失状态横幅："⚠️ 此衣服已报失"
- "查看联系方式"按钮（仅丢失时显示）
- "报告丢失"按钮（仅绑定的用户且未丢失时显示）
- "我的衣服"入口（绑定的用户）

**交互流程**：
```
拾获者扫描 → 看到衣服信息 + 丢失横幅
               ↓
           点击"查看联系方式"
               ↓
           显示弹窗：
           - 联系人：张女士
           - 电话：138****8000
           - [拨打电话] 按钮
           - 确认后统计曝光次数
```

### 6.3 我的衣服页（新增）

**路径**：`/pages/user/garments`

**内容**：
- 顶部统计："已绑定 X 件，报失 Y 件"
- 衣服列表（卡片式）
  - 衣服图片/信息
  - 状态标签：已绑定 / 已报失
  - 操作按钮：
    - 未报失：[报告丢失] [解绑] [编辑]
    - 已报失：[取消报失] [编辑]

### 6.4 报告丢失弹窗

**触发**：在"我的衣服"页点击"报告丢失"

**表单**：
- 丢失时间（日期时间选择器，默认当前）
- 丢失地点（输入框，可选）
- 备注信息（文本域，可选）
- [取消] [确认报告]

**确认后**：
- 显示成功提示
- 列表更新状态
- 可选：发送微信通知（如果实现了订阅消息）

### 6.5 联系方式弹窗

**触发**：在吊牌详情页点击"查看联系方式"

**内容**：
- 提示文案："此衣服已报失，请联系失主"
- 联系人：张女士
- 电话：138 0013 8000（完整号码）
- [拨打电话] 按钮（调用 wx.makePhoneCall）
- [关闭] 按钮

**注意**：
- 只在丢失状态显示
- 点击关闭后记录曝光统计

---

## 七、边界情况处理

### 7.1 并发绑定

**问题**：两个用户同时绑定同一个 SN

**解决方案**：
1. 数据库层面：`WHERE bound_by_user_id IS NULL` 条件确保只能绑定一次
2. 应用层面：乐观锁，检查 `updated_at` 字段
3. 事务处理：整个绑定操作在事务中完成

```javascript
// 伪代码
db.exec('BEGIN IMMEDIATE');
try {
  // 检查是否已绑定
  const garment = findGarmentBySn(db, sn);
  if (garment.bound_by_user_id) {
    throw new HttpError(409, '该吊牌已被绑定');
  }

  // 绑定
  bindGarmentOwner(db, sn, binding, userId);

  // 记录日志
  logBindingAction(db, sn, userId, 'bind', null, binding);

  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}
```

### 7.2 换绑问题

**问题**：用户 A 绑定后，想转让给用户 B

**解决方案**：
1. 用户 A 解绑 → 用户 B 绑定（两步操作）
2. 或者：用户 A 直接修改绑定信息（保留绑定权）

当前设计：只有绑定的用户可以解绑，所以换绑需要先解绑。

### 7.3 恶意报告丢失

**问题**：用户报告丢失后又找回，但忘记取消报告

**解决方案**：
1. 前端提示："如果您已找回，请取消报失"
2. 用户中心显示已报失列表，可以一键取消
3. 可选：自动过期（如 30 天后自动取消）

### 7.4 防刷机制

**问题**：恶意扫描、查询 DDoS

**解决方案**：
1. IP 限流：单 IP 每分钟最多查询 100 次
2. SN 限流：单 SN 每分钟最多查询 20 次
3. 联系方式曝光限流：单设备每小时最多查看 10 次

### 7.5 手机号变更

**问题**：用户换了手机号

**解决方案**：
1. 绑定信息的 `contact_phone` 可以修改
2. 用户表的 `phone` 单独管理
3. 修改时验证新手机号（发送验证码）

---

## 八、安全考虑

### 8.1 数据脱敏策略

| 场景 | 显示内容 |
|------|----------|
| 正常查询（未丢失） | 姓名：张**，电话尾号：8000 |
| 丢失状态 | 完整联系方式：13800138000 |
| 管理员 | 始终看到完整信息 |
| 绑定者本人 | 始终看到完整信息 |

### 8.2 隐私保护

1. **最小化数据收集**：只收集必要信息
2. **数据删除**：用户可请求删除自己的数据
3. **数据保留**：绑定日志保留 1 年，超过自动清理
4. **访问控制**：严格的 API 权限检查

### 8.3 防滥用

1. **绑定限制**：单个用户最多绑定 50 件衣服
2. **报告丢失限制**：单个用户同时最多 10 个有效报告
3. **操作限流**：防止恶意批量操作
4. **封禁机制**：管理员可封禁违规用户

---

## 九、实施计划

### 阶段 1：基础用户系统（1-2 周）
- [ ] 创建 `users` 表
- [ ] 实现微信登录 API
- [ ] 实现 Token 验证中间件
- [ ] 前端登录流程

### 阶段 2：绑定鉴权（1 周）
- [ ] 修改 `garments` 表添加 `bound_by_user_id`
- [ ] 创建 `binding_logs` 表
- [ ] 修改绑定 API 增加鉴权
- [ ] 前端登录检查

### 阶段 3：防丢功能（1-2 周）
- [ ] 创建 `lost_reports` 表
- [ ] 实现报告丢失 API
- [ ] 实现取消报失 API
- [ ] 修改查询 API 返回丢失状态
- [ ] 前端丢失报告流程

### 阶段 4：用户中心（1 周）
- [ ] 实现我的衣服 API
- [ ] 实现我的丢失报告 API
- [ ] 前端用户中心页面

### 阶段 5：完善与优化（1 周）
- [ ] 联系方式曝光统计
- [ ] 防刷限流
- [ ] 数据脱敏完善
- [ ] 测试与修复

---

## 十、测试场景

### 10.1 绑定流程
1. 用户未登录点击绑定 → 跳转微信登录
2. 登录成功后返回绑定表单
3. 填写信息提交 → 绑定成功
4. 刷新页面 → 仍显示绑定信息
5. 换设备登录 → 能看到自己的绑定记录

### 10.2 防丢流程
1. 绑定用户点击"报告丢失"
2. 填写丢失信息 → 提交成功
3. 换设备/游客扫描该 SN
4. 看到"已报失"横幅
5. 点击"查看联系方式" → 显示完整电话
6. 点击"拨打电话" → 调起电话拨打

### 10.3 边界情况
1. 两个人同时绑定同一 SN → 第二个失败
2. 绑定后尝试修改 → 只有绑定者可修改
3. 报告丢失后再报告 → 提示已报失
4. 手机号变更 → 可以修改绑定信息
5. 用户被封禁 → 无法登录，API 返回 403

---

以上是详细的逻辑设计，涵盖了数据库结构、API 设计、前端交互、边界处理等各个方面。
