---
name: wechat-login-simplified
description: 微信登录简化方案（无手机号解密）
metadata:
  type: project
  created: 2026-06-22
---

# 微信登录简化方案（用户手动输入手机号）

> 文档状态：历史设计稿，核心决策已被当前实现采纳。当前系统使用微信 `code2session` 获取 openid，不做手机号解密；联系电话由用户在绑定表单中手动填写。当前实现状态请优先阅读 [current-system-state.md](current-system-state.md)。

**决策**: 用户手动输入联系电话，不使用微信手机号解密
**原因**: 无短信验证服务，简化实现

---

## 一、登录流程（简化版）

### 1.1 时序图

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
     │                            │ 3. code 换 openid         │
     │                            │    (appid + secret)       │
     │                            ├──────────────────────────→│
     │                            │                            │
     │                            │ 4. 返回 openid (+ session_key，但不用)
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

### 1.2 关键变化

| 原方案 | 简化方案 |
|--------|----------|
| 需 encryptedData, iv | 只需 code |
| 需要 session_key 解密 | **忽略 session_key** |
| 微信解密手机号 | 用户手动输入 |

---

## 二、API 设计

### 2.1 登录 API

**端点**: `POST /api/auth/wechat/login`

**请求参数**（简化）:
```json
{
  "code": "wx_login_code"  // 只需要这一个参数
}
```

**响应**:
```json
{
  "token": "base64url_encoded_jwt",
  "user": {
    "id": 123,
    "openid": "wx_xyz...",
    "nickname": "微信用户",  // 微信默认昵称，用户可后续修改
    "avatarUrl": "https://...",  // 微信默认头像
    "bindingCount": 0,
    "lostReportCount": 0
  },
  "isNewUser": false
}
```

### 2.2 users 表（简化）

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 微信身份（核心）
  openid TEXT NOT NULL UNIQUE,

  -- 用户资料（可选）
  nickname TEXT,              -- 可从微信获取，或后续用户自己设置
  avatar_url TEXT,

  -- 手机号（用户后续绑定/修改时手动输入）
  phone TEXT,
  phone_verified_at TEXT,     -- 无短信验证，留空或去掉

  -- 状态字段
  status TEXT NOT NULL DEFAULT 'active',    -- active / banned
  banned_at TEXT,
  banned_reason TEXT,

  -- 统计字段
  binding_count INTEGER NOT NULL DEFAULT 0,
  lost_report_count INTEGER NOT NULL DEFAULT 0,

  -- 时间戳
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE INDEX idx_users_openid ON users(openid);
CREATE INDEX idx_users_status ON users(status);
```

**变化**：
- ❌ 去掉 `unionid`（不需要开放平台关联）
- ❌ 去掉 `phone_verified_at`（无验证机制）
- ✅ 保留 `phone` 字段（用户手动输入）

---

## 三、手机号获取流程

### 方案 A：绑定衣服时输入（推荐）

用户在绑定衣服时输入联系电话：

```
┌─────────────────────────────────────────────────────────────┐
│                        绑定表单                              │
├─────────────────────────────────────────────────────────────┤
│  学生姓名 *: [________________]                             │
│  学校 *: [________________]                                 │
│  班级 *: [________________]                                 │
│  联系人 *: [________________]  ← 这里是联系人（如家长）        │
│  联系电话 *: [________________]  ← 这里是联系电话           │
│                                                             │
│  [立即绑定]                                                  │
└─────────────────────────────────────────────────────────────┘
```

**逻辑**：
- 电话号码存入 `garments.contact_phone`
- 不存入 `users.phone`（因为一个用户可能绑定多件衣服，每件联系人不同）

### 方案 B：用户设置中统一设置（可选）

如果想让用户统一管理手机号：

```
┌─────────────────────────────────────────────────────────────┐
│                        用户中心                              │
├─────────────────────────────────────────────────────────────┤
│  [我的衣服]  [丢失报告]  [账户设置]                          │
│                                                             │
│  账户设置:                                                  │
│    昵称: [________________]                                 │
│    手机号: [________________]  ← 统一设置                   │
│                                                             │
│  保存后，新绑定的衣服默认使用此手机号                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、后端实现示例

### 4.1 登录处理

```javascript
// server/src/auth.js - 新增微信登录函数

import https from 'node:https';

export async function code2Openid(code, appId, appSecret) {
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', appSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.errcode) {
            reject(new Error(`微信登录失败: ${result.errmsg}`));
          } else {
            resolve(result);  // { openid, session_key, unionid? }
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}
```

```javascript
// server/src/api.js - 登录 API

async function handleWechatLogin(req, res, context) {
  const { code } = await readJson(req);

  if (!code) {
    throw new HttpError(400, '缺少授权码');
  }

  // 1. 用 code 换取 openid
  const wechatResult = await code2Openid(
    code,
    config.wechatAppId,
    config.wechatAppSecret
  );

  const { openid } = wechatResult;
  // 注意：忽略 session_key，因为我们不需要解密手机号

  // 2. 查询或创建用户
  let user = findUserByOpenid(context.db, openid);
  let isNewUser = false;

  if (!user) {
    user = createUser(context.db, {
      openid,
      nickname: '微信用户',  // 默认昵称
      status: 'active'
    });
    isNewUser = true;
  }

  // 3. 更新最后登录时间
  updateUserLastLogin(context.db, user.id);

  // 4. 创建用户 token
  const token = createUserToken(user, config.userTokenSecret);

  // 5. 返回
  sendJson(req, res, context.config, 200, {
    token,
    user: toUserDto(user),
    isNewUser
  });
}
```

### 4.2 数据库函数

```javascript
// server/src/db.js - 新增用户相关函数

export function findUserByOpenid(db, openid) {
  return db.prepare(
    'SELECT * FROM users WHERE openid = ? AND status = "active"'
  ).get(openid);
}

export function createUser(db, { openid, nickname, phone }) {
  const now = nowIso();
  const result = db.prepare(`
    INSERT INTO users (openid, nickname, phone, status, binding_count, lost_report_count, created_at, updated_at, last_login_at)
    VALUES (?, ?, ?, 'active', 0, 0, ?, ?, ?)
  `).run(openid, nickname || '微信用户', phone || null, now, now, now);

  return {
    id: result.lastInsertRowid,
    openid,
    nickname: nickname || '微信用户',
    phone: phone || null,
    bindingCount: 0,
    lostReportCount: 0
  };
}

export function updateUserLastLogin(db, userId) {
  const now = nowIso();
  db.prepare(`
    UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?
  `).run(now, now, userId);
}

export function toUserDto(user) {
  return {
    id: user.id,
    openid: user.openid,
    nickname: user.nickname,
    avatarUrl: user.avatar_url,
    phone: user.phone ? desensitizePhone(user.phone) : null,  // 脱敏显示
    bindingCount: user.binding_count,
    lostReportCount: user.lost_report_count
  };
}
```

---

## 五、环境变量

```bash
# server/.env 新增
WECHAT_APP_ID=wx1234567890abcdef
WECHAT_APP_SECRET=abcd1234...

USER_TOKEN_SECRET=your-user-token-secret-here
USER_TOKEN_TTL_DAYS=30
```

---

## 六、前端实现

### 6.1 登录组件

```vue
<template>
  <view class="login-page">
    <view class="title">微信登录</view>
    <button @click="() => handleLogin()">授权登录</button>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { login } from '@/utils/api';

async function handleLogin() {
  uni.showLoading({ title: '登录中...' });

  try {
    // 1. 获取微信登录 code
    const { code } = await new Promise((resolve, reject) => {
      uni.login({
        provider: 'weixin',
        success: resolve,
        fail: reject
      });
    });

    // 2. 发送给后端
    const res = await login.wechat({ code });

    // 3. 存储 token
    uni.setStorageSync('token', res.token);
    uni.setStorageSync('user', res.user);

    uni.hideLoading();
    uni.showToast({ title: '登录成功', icon: 'success' });

    // 4. 返回上一页或跳转首页
    setTimeout(() => {
      uni.navigateBack();
    }, 1000);

  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: e.message || '登录失败', icon: 'none' });
  }
}
</script>
```

### 6.2 API 封装

```javascript
// client/src/utils/api.js 新增

export const login = {
  async wechat({ code }) {
    const res = await uni.request({
      url: `${BASE_URL}/api/auth/wechat/login`,
      method: 'POST',
      data: { code }
    });
    return res.data;
  }
};
```

---

## 七、简化后的优势

| 对比项 | 原方案（解密手机号） | 简化方案（手动输入） |
|--------|---------------------|---------------------|
| 复杂度 | 高（需处理 session_key） | 低 |
| 后端存储 | 需加密存储 session_key | 无需存储 |
| 过期处理 | 需处理 session_key 过期 | 无此问题 |
| 用户体验 | 自动获取，一步到位 | 需手动输入 |
| 灵活性 | 固定微信手机号 | 可自定义（如家长电话） |
| 适用场景 | 需要真实手机号 | 校服场景更合适 |

**结论**: 对于校服防丢场景，**简化方案更合适**：
- 联系电话通常是家长的，不是学生的微信号
- 手动输入更灵活（可以是任意联系人电话）
- 实现简单，无维护负担

---

## 八、实施检查清单

阶段 1：基础用户系统
- [ ] 配置 WECHAT_APP_ID 和 WECHAT_APP_SECRET
- [ ] 创建 users 表（简化版）
- [ ] 实现 code2Openid 函数
- [ ] 实现登录 API `/api/auth/wechat/login`
- [ ] 创建用户 Token（type: "user"）
- [ ] 前端登录页面
- [ ] 前端登录状态检查和跳转

---

**文档版本**: 1.0
**创建日期**: 2026-06-22
**状态**: ✅ 简化方案确认
