---
name: implementation-plan-updated
description: 更新的实施计划（3所学校规模，含统计和导出）
metadata:
  type: project
  created: 2026-06-22
---

# Cyber-Pendant 实施计划（更新版）

> 文档状态：历史实施计划。文档中的用户系统、绑定鉴权、防丢、用户中心、后台用户管理、统计和导出多数已经实现；剩余事项应作为后续路线参考，而不是当前缺口清单。当前实现状态请阅读 [current-system-state.md](current-system-state.md)，交付流程请阅读 [operations-handbook.md](operations-handbook.md)。

**项目规模**: 3 所学校
**新增需求**: 数据统计 + 数据导出

---

## 规模估算

```
3 所学校 × ~1000 学生/校 = ~3000 学生
3000 学生 × 2 件校服/人 = ~6000 件衣服（garments）
日查询量：估计 100-500 次/天
```

**技术影响**: SQLite 完全可以承载，无需特殊优化。

---

## 实施计划（6 个阶段）

### 阶段 1：基础用户系统（1-2 周）

#### 后端
- [ ] 创建 `users` 表（简化版）
- [ ] 配置 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`
- [ ] 实现 `code2Openid()` 函数
- [ ] 实现登录 API `POST /api/auth/wechat/login`
- [ ] 实现用户 Token 验证中间件 `requireUser()`
- [ ] 创建用户相关数据库函数

#### 前端
- [ ] 微信登录页面 `/pages/login/index.vue`
- [ ] 登录状态检查和自动跳转
- [ ] API 封装和 Token 存储

#### 验收标准
- ✅ 用户可以微信登录并获得 token
- ✅ 未登录用户访问需要登录的页面会跳转
- ✅ Token 过期后需要重新登录

---

### 阶段 2：绑定鉴权（1 周）

#### 后端
- [ ] 修改 `garments` 表添加 `bound_by_user_id` 字段
- [ ] 创建 `binding_logs` 表
- [ ] 修改绑定 API，增加登录鉴权
- [ ] 实现解绑 API `DELETE /api/garments/{sn}/binding`
- [ ] 实现修改绑定信息 API `PUT /api/garments/{sn}/binding`
- [ ] 实现并发控制（事务 + WHERE 条件）

#### 前端
- [ ] 绑定前检查登录状态
- [ ] 绑定成功后显示"我的衣服"入口
- [ ] 解绑/修改功能

#### 验收标准
- ✅ 未登录用户点击绑定会跳转登录
- ✅ 绑定后 `bound_by_user_id` 正确记录
- ✅ 只有绑定者可以解绑/修改
- ✅ 并发绑定时只有一个成功

---

### 阶段 3：防丢功能（1-2 周）

#### 后端
- [ ] 创建 `lost_reports` 表（含 `expires_at` 字段）
- [ ] 实现报告丢失 API `POST /api/garments/{sn}/report-lost`
- [ ] 实现取消报失 API `DELETE /api/garments/{sn}/report-lost`
- [ ] 修改查询 API，丢失时返回完整联系方式
- [ ] 实现联系方式曝光统计 `POST /api/garments/{sn}/contact-reveal`
- [ ] 实现 30 天自动过期逻辑

#### 前端
- [ ] 丢失状态横幅显示
- [ ] "报告丢失"弹窗和流程
- [ ] "查看联系方式"弹窗
- [ ] 拨打电话功能 `wx.makePhoneCall`

#### 验收标准
- ✅ 绑定用户可以报告丢失
- ✅ 丢失后拾获者可以看到完整联系方式
- ✅ 点击"查看联系方式"会统计曝光次数
- ✅ 可以取消报失

---

### 阶段 4：用户中心与管理功能（1-2 周）

#### 4.1 用户中心（前端）

- [ ] "我的衣服"页面 `/pages/user/garments.vue`
- [ ] "我的丢失报告"页面 `/pages/user/reports.vue`
- [ ] 用户设置页面 `/pages/user/settings.vue`
- [ ] 底部 TabBar 导航（首页 / 我的）

#### 4.2 管理员用户管理（后端 + 前端）

- [ ] 用户列表 API `GET /api/admin/users`
- [ ] 用户详情 API `GET /api/admin/users/:id`
- [ ] 封禁用户 API `POST /api/admin/users/:id/ban`
- [ ] 解封用户 API `POST /api/admin/users/:id/unban`
- [ ] 管理后台用户管理页面

#### 4.3 数据统计（后端 + 前端）

**统计 API**
```javascript
GET /api/admin/stats
响应: {
  "users": { "total": 1234, "active": 1200, "banned": 34 },
  "garments": { "total": 6000, "bound": 4500, "lost": 15 },
  "reports": { "active": 15, "found": 89, "cancelled": 5 },
  "today": { "views": 234, "bindings": 12 }
}
```

- [ ] 统计 API `GET /api/admin/stats`
- [ ] 管理后台统计面板（卡片展示）

#### 4.4 数据导出（后端 + 前端）

**导出 API**
```javascript
GET /api/admin/export/users
GET /api/admin/export/garments
GET /api/admin/export/reports
GET /api/admin/export/binding-logs
```

- [ ] 用户导出 API（CSV 格式）
- [ ] 绑定记录导出 API（CSV 格式）
- [ ] 丢失报告导出 API（CSV 格式）
- [ ] 管理后台导出按钮和下载

#### 验收标准
- ✅ 用户可以查看"我的衣服"和"我的丢失报告"
- ✅ 管理员可以查看用户列表并封禁/解封
- ✅ 管理后台显示关键统计数据
- ✅ 管理员可以导出各类数据为 CSV

---

### 阶段 5：完善与优化（1 周）

- [ ] IP 和 SN 限流（内存 + SQLite 混合）
- [ ] 数据脱敏策略完善
- [ ] 并发绑定处理（已包含在阶段 2）
- [ ] 恶意报告丢失防护（30 天自动过期）
- [ ] 单元测试和集成测试

#### 验收标准
- ✅ 所有测试用例通过
- ✅ 限流机制生效
- ✅ 数据脱敏正确

---

## API 汇总（新增）

### 用户相关

```
POST /api/auth/wechat/login      # 微信登录
GET  /api/user/garments          # 我的衣服
GET  /api/user/lost-reports      # 我的丢失报告
GET  /api/user/binding-logs      # 绑定历史
```

### 绑定相关（需登录）

```
POST   /api/garments/{sn}/binding        # 绑定
PUT    /api/garments/{sn}/binding        # 修改绑定信息
DELETE /api/garments/{sn}/binding        # 解绑
```

### 防丢相关

```
POST   /api/garments/{sn}/report-lost           # 报告丢失
DELETE /api/garments/{sn}/report-lost           # 取消报失
POST   /api/garments/{sn}/contact-reveal        # 联系方式曝光统计
```

### 管理员相关

```
GET  /api/admin/users                    # 用户列表
GET  /api/admin/users/:id                # 用户详情
POST /api/admin/users/:id/ban            # 封禁用户
POST /api/admin/users/:id/unban          # 解封用户
GET  /api/admin/stats                    # 数据统计
GET  /api/admin/export/users            # 导出用户
GET  /api/admin/export/garments          # 导出衣服
GET  /api/admin/export/reports           # 导出报告
GET  /api/admin/export/binding-logs      # 导出绑定日志
```

---

## 数据库变更汇总

### 新增表

```sql
-- 用户表
CREATE TABLE users (...);

-- 绑定日志表
CREATE TABLE binding_logs (...);

-- 丢失报告表
CREATE TABLE lost_reports (...);

-- 限流表（可选，用于长期限流）
CREATE TABLE rate_limits (...);
```

### 修改表

```sql
-- garments 表新增字段
ALTER TABLE garments ADD COLUMN bound_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE garments ADD COLUMN lost_report_id INTEGER REFERENCES lost_reports(id);
```

### 新增索引

```sql
CREATE INDEX idx_users_openid ON users(openid);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_binding_logs_garment ON binding_logs(garment_id);
CREATE INDEX idx_binding_logs_user ON binding_logs(user_id);
CREATE INDEX idx_lost_reports_garment ON lost_reports(garment_id);
CREATE INDEX idx_lost_reports_status ON lost_reports(status);
CREATE INDEX idx_garments_bound_by ON garments(bound_by_user_id);
CREATE INDEX idx_garments_lost_report ON garments(lost_report_id);
```

---

## 前端页面结构

```
pages/
├── index/                    # 首页（查询）✅ 已有
│   └── index.vue
├── garment/                  # 吊牌详情 ✅ 已有
│   └── detail.vue
├── login/                    # 🆧 微信登录
│   └── index.vue
├── user/                     # 🆧 用户中心
│   ├── garments.vue          # 我的衣服
│   ├── reports.vue           # 我的丢失报告
│   └── settings.vue          # 用户设置
└── ...

pages.json 配置:
- tabBar: { 首页, 我的 }
- 登录页面: independent=true
```

---

## 时间估算

| 阶段 | 工作量 | 累计时间 |
|------|--------|----------|
| 阶段 1：基础用户系统 | 1-2 周 | 1-2 周 |
| 阶段 2：绑定鉴权 | 1 周 | 2-3 周 |
| 阶段 3：防丢功能 | 1-2 周 | 3-5 周 |
| 阶段 4：用户中心 + 管理功能 | 1-2 周 | 4-7 周 |
| 阶段 5：完善与优化 | 1 周 | 5-8 周 |

**总计**: 约 **1.5 - 2 个月**

---

## 下一步

**准备好开始阶段 1 了？**

第一阶段任务：
1. 配置微信小程序参数
2. 创建 users 表
3. 实现微信登录 API
4. 实现前端登录页面

---

**文档版本**: 2.0
**更新日期**: 2026-06-22
**状态**: ✅ 已包含统计和导出功能
