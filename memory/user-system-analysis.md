---
name: user-system-analysis
description: 用户系统与防丢功能设计分析报告
metadata:
  type: project
---

# Cyber-Pendant 用户系统与防丢功能分析报告

> 文档状态：历史分析稿。本文写于用户系统、防丢功能和用户中心落地之前，保留用于理解当时的问题判断和设计动机。当前实现状态请优先阅读 [current-system-state.md](current-system-state.md) 和 [operations-handbook.md](operations-handbook.md)。

## 一、当前系统现状

### 1.1 用户系统设计
| 组件 | 现状 |
|------|------|
| 管理员系统 | ✅ 有 `admins` 表，PBKDF2 哈希 + JWT Token（7天TTL） |
| 前端用户系统 | ❌ **无用户表，无登录/鉴权系统** |
| 微信登录集成 | ❌ **未实现** |
| 用户操作审计 | ❌ **无记录** |

### 1.2 绑定功能分析
- **API端点**：`POST /api/garments/{sn}/binding`
- **鉴权要求**：**无，任何人都可以调用**
- **数据存储**：
  - `student_name`, `student_school`, `student_class`
  - `contact_name`, `contact_phone`
  - `owner_name`, `owner_phone_tail`, `owner_bound_at`
- **问题**：**没有记录是谁绑定的**（缺少 `bound_by_user_id` 字段）

### 1.3 查询功能分析
- **API端点**：`GET /api/garments/{sn}`
- **返回数据**：
  - `owner`: 脱敏信息（姓名首字 + **、学校班级、电话尾号）
  - `binding`: 仅管理员可见的完整信息
- **防丢场景问题**：
  - 普通人捡到衣服 → 只能看到脱敏信息
  - **无法联系失主** → 防丢功能失效

## 二、问题总结

### 问题 1：微信登录缺失
**影响**：
- 无法区分用户身份
- 无法进行操作审计
- 无法实现用户专属功能（如"我绑定的衣服"列表）

### 问题 2：绑定操作无鉴权
**影响**：
- 任何人都可以绑定衣服
- 可能出现恶意绑定（别人绑定了你的衣服）
- 绑定后无法修改或转移（因为没有"是我的"证明）

### 问题 3：防丢功能不完整
**影响**：
- 衣服丢失后，拾获者只能看到脱敏信息
- **无法联系失主** → 防丢功能名存实亡
- 与产品设计初衷（防丢）严重不符

### 问题 4：绑定信息查询不完善
**影响**：
- 没有提供查询完整信息的合理渠道
- 管理员能看，但普通用户（如拾获者）无法获得联系方式

## 三、设计方案建议

### 3.1 新增数据表

```sql
-- 用户表（支持微信登录）
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openid TEXT NOT NULL UNIQUE,           -- 微信 openid
  unionid TEXT,                           -- 微信 unionid（多应用关联）
  nickname TEXT,                          -- 微信昵称
  avatar_url TEXT,                        -- 头像
  phone TEXT,                             -- 手机号（需授权）
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 绑定操作记录表（审计）
CREATE TABLE binding_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garment_id INTEGER NOT NULL REFERENCES garments(id),
  user_id INTEGER REFERENCES users(id),  -- 谁绑定的
  action TEXT NOT NULL,                   -- bind/unbind/modify
  before_data TEXT,                       -- JSON：变更前数据
  after_data TEXT,                        -- JSON：变更后数据
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

-- 丢失报告表
CREATE TABLE lost_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garment_id INTEGER NOT NULL REFERENCES garments(id),
  reporter_id INTEGER REFERENCES users(id), -- 报告人（通常是失主）
  report_time TEXT NOT NULL,
  is_found INTEGER DEFAULT 0,             -- 是否已找回
  found_time TEXT,
  note TEXT,                              -- 备注信息
  created_at TEXT NOT NULL
);

-- 修改 garments 表，添加关联
ALTER TABLE garments ADD COLUMN bound_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE garments ADD COLUMN lost_report_id INTEGER REFERENCES lost_reports(id);
```

### 3.2 API 设计

#### 微信登录相关
```
POST /api/auth/wechat/login
- 参数: code (微信授权码)
- 返回: { token, user }

GET /api/auth/wechat/config
- 返回微信 JSSDK 配置（用于前端调用微信登录）
```

#### 绑定相关（需要登录）
```
POST /api/garments/{sn}/binding
- 需要 Authorization 头
- 记录 bound_by_user_id
- 创建 binding_log 记录

PUT /api/garments/{sn}/binding
- 需要 bound_by_user_id 匹配或管理员权限
- 允许修改自己的绑定信息

DELETE /api/garments/{sn}/binding
- 需要 bound_by_user_id 匹配或管理员权限
```

#### 防丢相关
```
POST /api/garments/{sn}/report-lost
- 需要登录，且必须是绑定的用户
- 标记衣服为丢失状态
- 创建 lost_report 记录

GET /api/garments/{sn}?showContact=true
- 当衣服处于丢失状态（lost_report_id 不为空）
- 返回完整的联系方式（供拾获者联系）
```

#### 用户中心
```
GET /api/user/garments
- 返回"我绑定的衣服"列表

GET /api/user/lost-reports
- 返回"我报告丢失的衣服"列表
```

### 3.3 业务流程设计

#### 正常绑定流程
```
1. 用户微信登录 → 获得 token
2. 扫描二维码/输入 SN
3. 点击绑定 → 填写信息
4. 后端记录 bound_by_user_id
5. 返回成功
```

#### 防丢流程
```
失主侧：
1. 发现衣服丢失
2. 登录系统 → 找到该衣服
3. 点击"报告丢失"
4. 系统标记为丢失状态

拾获者侧：
1. 捡到衣服，扫描二维码
2. 看到页面显示"此衣服已报失"
3. 显示"联系失主"按钮
4. 点击后显示完整联系方式
5. 电话联系失主
```

## 四、安全与隐私考虑

### 4.1 数据脱敏策略
- **正常状态**：只显示脱敏信息（首字**、班级、尾号）
- **丢失状态**：显示完整联系方式（给失主找回的机会）
- **管理员**：始终能看到完整信息

### 4.2 防滥用措施
- 限制单个用户可绑定的衣服数量
- 同一 SN 不能重复绑定（除非解绑）
- 丢失报告需要验证（绑定的用户才能报告）
- IP 限流防止恶意扫描

## 五、实施优先级

### P0（核心功能）
1. 添加 `users` 表和微信登录 API
2. 修改绑定 API，增加 `bound_by_user_id` 和登录要求
3. 添加丢失报告功能和"显示联系方式"逻辑

### P1（增强功能）
1. 添加用户中心（我的衣服、我的丢失报告）
2. 添加绑定操作审计日志
3. 添加防滥用限流

### P2（优化功能）
1. 绑定信息修改功能
2. 找回后标记功能
3. 推送通知（衣服丢失提醒）

## 六、数据库迁移脚本

```sql
-- 1. 创建 users 表
CREATE TABLE IF NOT EXISTS users (...);

-- 2. 修改 garments 表
ALTER TABLE garments ADD COLUMN bound_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE garments ADD COLUMN lost_report_id INTEGER REFERENCES lost_reports(id);

-- 3. 创建关联表
CREATE TABLE IF NOT EXISTS binding_logs (...);
CREATE TABLE IF NOT EXISTS lost_reports (...);

-- 4. 创建索引
CREATE INDEX idx_garments_bound_by ON garments(bound_by_user_id);
CREATE INDEX idx_garments_lost_report ON garments(lost_report_id);
CREATE INDEX idx_binding_logs_garment ON binding_logs(garment_id);
CREATE INDEX idx_binding_logs_user ON binding_logs(user_id);
```

---

## 总结

当前项目的核心问题是**缺少用户系统和完善的防丢流程**。要实现防丢失功能的设计初衷，需要：

1. **实现微信登录** → 建立用户身份体系
2. **绑定需要鉴权** → 确保绑定操作可追溯
3. **添加丢失报告机制** → 让失主可以主动报告丢失
4. **丢失时显示完整联系方式** → 让拾获者能联系失主

这些改进将使项目从"吊牌查询系统"转变为真正的"防丢失校服系统"。
