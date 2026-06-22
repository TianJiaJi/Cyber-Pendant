# Cyber-Pendant 深度代码审查报告

审查日期：2026-06-22  
审查方式：静态代码阅读、架构健康检查、现有测试/构建验证、依赖审计  
审查口径：找茬优先，问题按 `[必须修复]`、`[建议修改]`、`[仅供参考]` 分级

## 审查门禁结论

### ArchAirlock 路由

- `decision`: `ROUTE`
- `risk_level`: `CRITICAL`
- `primary_route`: `maintenance-guardian`
- `secondary_routes`: `architecture-guardian`, `refactor-agent`, `implementation-agent`
- `required_input`: 后续修复前需要明确生产安全边界、PII 展示策略、用户身份体系、审计要求、硬删除策略。
- `handoff_context`: 本次是维护与安全审查，不改生产代码。审查发现公开绑定、PII 暴露、CORS 策略、导出注入、硬删除和依赖漏洞等生产风险。
- `blocked_reason`: 空
- `verification_required`: 后续修复至少需要后端 API 测试、前端构建、管理台构建、依赖审计和关键隐私用例测试。

### Maintenance Guardian 结论

- `health_status`: `CRITICAL`
- `risk_level`: `CRITICAL`
- `required_next_gate`: `architecture-guardian`
- `architecture_drift`: `memory/security-principles.md` 描述了“客户端零信任、服务端鉴权、防刷、审计”，但当前代码的公开绑定、公开展示、审计链路没有达到这套原则。
- `technical_debt_records`: 见下方问题清单。`maintenance-guardian` 只记录约束，不授权直接改代码。
- `duplicate_logic`: `splitStandardList`/`standardDisplayText` 在用户端详情、管理台列表、管理台详情中重复；状态文案、日期格式、绑定字段展示也多处分散。
- `complexity_growth`: `server/src/db.js` 1136 行、`server/src/api.js` 904 行、`server/admin/src/views/ClothingDetailView.vue` 1837 行、`client/src/pages/garment/detail.vue` 1222 行，已经进入“改一处容易碰一片”的状态。

## 必须修复

### [必须修复] 公开绑定接口无用户身份校验，可被任意扫码者抢绑/污染学生 PII

证据：

- `server/src/api.js:413-430` 中 `handleBindGarment()` 不调用 `requireAdmin()`，也没有 `requireUser()` 或任何用户身份校验。
- `server/src/db.js:699-731` 只用 `WHERE sn = ? AND owner_bound_at IS NULL AND student_name IS NULL` 防并发，没有证明请求者就是真实持有人。
- `client/src/pages/garment/detail.vue:146-213` 公开页直接提供绑定表单。
- `client/src/pages/garment/detail.vue:418-456` 前端提交学生姓名、学校、班级、联系人和电话。

风险：

任何拿到 SN 或扫到二维码的人都能先绑定一条学生信息。一旦被抢绑，真实用户会收到“已绑定”，只能找管理员解绑。这对校服/学生场景不是小 bug，是身份归属和隐私链路的根基问题。

建议：

- 绑定必须进入用户身份体系，比如微信登录、一次性校验码、管理员预置凭证或订单/学校侧校验。
- 服务端从 token 解析用户，不接受客户端传 userId。
- 增加 `binding_logs` 或等价审计表，记录 bind/unbind/admin_unbind 的操作者、IP、UA、前后快照。
- 加服务端限流和重复失败保护。
- 补测试：未登录绑定应返回 401；登录用户绑定成功；非绑定者不能解绑；管理员解绑要落审计。

### [必须修复] 公开接口对任意扫码者暴露学生学校、班级和电话尾号

证据：

- `server/src/db.js:978-985` 公开 DTO 的 `owner` 包含 `name`, `school`, `className`, `phoneTail`, `boundAt`。
- `client/src/pages/garment/detail.vue:274-284` 公开详情页把这些字段拼成“张* · 学校 · 班级 · 电话尾号 xxxx”。
- `server/test/api.test.js:180-183` 明确断言公开返回学校、班级和电话尾号。

风险：

姓名打星不等于隐私安全。学校 + 班级 + 电话尾号 + 校服信息，在未成年人场景下已经足够形成高风险画像。现在任意扫码者都能看到，不需要登录、不需要证明关系。

建议：

- 公开查询只返回 `isBound`、吊牌状态和非个人化溯源信息。
- 学校、班级、电话尾号只给绑定者本人、管理员或明确的丢失找回流程展示。
- 后端 DTO 根据调用身份决定字段，不要把隐私数据交给客户端再决定显示。
- 修改测试，把当前公开暴露字段的断言改成“默认不可见”。

### [必须修复] CORS 配置实际会反射任意 Origin，配置白名单形同虚设

证据：

- `server/src/api.js:52-58` 中当 `config.corsOrigin !== '*'` 时，仍然使用 `req.headers.origin || config.corsOrigin`。
- `server/src/config.js:86` 默认 `corsOrigin` 是 `*`。
- `server/.env.example:6` 虽写了 `CORS_ORIGIN=http://localhost:5173`，但当前实现会把任意请求 Origin 原样写回。

风险：

这不是“默认宽松”那么简单，而是“看起来配了白名单，实际没有拦”。管理端使用 Authorization header，CSRF 风险较低，但公开接口、错误信息、未来 cookie 化鉴权都会被这个实现拖后腿。

建议：

- 支持 allowlist，只有匹配的 Origin 才返回 `Access-Control-Allow-Origin`。
- 增加 `Vary: Origin`。
- 生产环境禁止默认 `*`，缺失 CORS 配置时启动失败或只允许同源。
- 补测试：允许来源通过，非允许来源不返回可读 CORS 头。

### [必须修复] 登录没有限速、锁定、撤销机制，后台 token 存在 localStorage

证据：

- `server/src/api.js:314-324` 登录只校验用户名密码，没有失败计数、IP/账号限速或锁定。
- `server/src/auth.js:62-99` token 是自签 HMAC payload，7 天有效，没有 `jti`、版本号、撤销表或密码变更失效机制。
- `server/admin/src/utils/api.js:21-33` 从 `localStorage` 取 token 后塞进 Authorization。
- `server/admin/src/utils/api.js:65-74` token 持久存放在 `localStorage`。
- `server/src/config.js:67-89` 没有 `TOKEN_SECRET` 时会生成进程级临时 secret。

风险：

后台入口可以被暴力尝试；一旦管理台出现 XSS 或浏览器插件泄露，localStorage token 可直接被拿走；管理员改密码也无法让已签发 token 失效。临时 secret 在开发方便，但生产如果误配会导致重启全员掉线，而且隐藏了配置错误。

建议：

- 给 `/api/auth/login` 加 IP + username 维度限速，连续失败锁定或延迟。
- 引入 session 表或 token version，支持退出、改密、强制撤销。
- 生产环境强制要求 `TOKEN_SECRET`，不要随机兜底。
- 管理台优先考虑 HttpOnly Secure SameSite cookie；如果继续用 Bearer token，至少加 CSP、短 TTL 和刷新/撤销机制。

### [必须修复] 客户端调试日志会打印环境、请求数据和绑定 PII

证据：

- `client/src/utils/api.js:4-9` 打印 `import.meta.env`。
- `client/src/utils/api.js:18-22` 每次请求打印 URL、method、data、headers。
- `client/src/utils/api.js:30-32` 打印完整响应。
- `client/src/pages/index/index.vue:98-100`, `client/src/pages/index/index.vue:158-215` 有大量查询流程日志。
- `client/src/utils/scanner.js:1-50` 扫码内容和提取结果也会打印。

风险：

绑定学生信息时，`options.data` 包含学生姓名、学校、班级、联系人、电话。生产环境 console 不是安全边界，真机调试、第三方 WebView、日志采集和截图排障都可能把 PII 带出去。

建议：

- 移除生产日志，或者封装 `debugLog()` 并受 `import.meta.env.DEV` 控制。
- 对 SN、手机号、学生姓名做脱敏后再记录。
- 增加构建检查，禁止生产包出现这些调试前缀。

### [必须修复] 真删除是查询参数触发，缺少审计、备份和二次强确认

证据：

- `server/src/api.js:143-144` 用 `?hard=1` 或 `?hard=true` 判断真删除。
- `server/src/api.js:498-500`, `server/src/api.js:590-592`, `server/src/api.js:679-681` 对衣服、批次、SN 执行硬删除。
- `server/src/db.js:531-533`, `server/src/db.js:656-657`, `server/src/db.js:894-896` 直接删除数据。
- `server/admin/src/views/ClothingDetailView.vue:763-779`, `server/admin/src/views/ClothingDetailView.vue:894-912`, `server/admin/src/views/ClothingDetailView.vue:959-976` 只有 `window.confirm()`。

风险：

这个系统的 SN 会印刷到实物上。真删除后二维码直接查不到，且没有审计、没有操作者记录、没有恢复路径。对实物标签系统来说，这是不可逆业务事故入口。

建议：

- 默认只软删除；真删除改为单独后台能力，要求输入 SN/批次名二次确认。
- 删除前给出影响数量和可下载备份。
- 所有真删除写审计日志，至少包括操作者、对象、数量、时间、IP、原因。
- 后端 API 不用 `?hard=1` 做危险行为开关，改为显式 endpoint 或带操作确认 token。

### [必须修复] CSV/Excel 导出存在公式注入风险，且 `xlsx` 依赖有 high 漏洞无修复

证据：

- `server/admin/src/views/ClothingDetailView.vue:1017-1044` 直接把数据写入 Excel。
- `server/admin/src/views/ClothingDetailView.vue:1047-1049` CSV 只处理引号、逗号、换行，没有处理 `=`, `+`, `-`, `@` 等公式前缀。
- `npm --prefix server/admin audit --omit=dev` 报告 `xlsx` high：Prototype Pollution、ReDoS，且 `No fix available`。

风险：

导出文件会交给印刷、学校或运营人员打开。只要字段中混入公式前缀，表格软件就可能执行公式或触发外连。即使数据主要来自管理员，也不能假设导出链路可信。

建议：

- 所有导出单元格统一做 formula escaping：遇到 `=`, `+`, `-`, `@`, tab, CR/LF 等危险前缀时前置 `'` 或按目标格式安全转义。
- 替换 `xlsx`，或把导出收敛为服务端生成的安全 CSV。
- 补导出单元测试，覆盖公式前缀、引号、换行、超长字段。

### [必须修复] 前端依赖审计不合格，生产交付前不能忽略

证据：

- `npm --prefix server audit --omit=dev`: 0 vulnerabilities。
- `npm --prefix client audit --omit=dev`: 30 vulnerabilities，包含 9 high。
- `npm --prefix server/admin audit --omit=dev`: 3 vulnerabilities，包含 `vite/esbuild` high 和 `xlsx` high。
- `client/package.json`、`server/package.json` 使用 `latest` 依赖，如 `html5-qrcode`、`qrcode`，可重复构建性较差。

风险：

这是典型“后端干净，前端工具链冒烟”的状态。很多漏洞在 dev server 或构建链，但小程序/H5 项目经常把构建工具放在 dependencies 里，审计结果不能一句“只是 dev”就略过。

建议：

- 锁定依赖版本，避免 `latest`。
- 优先升级 `vite`、`esbuild` 可修复项。
- 对 `@dcloudio/*` alpha 链路单独评估升级路径，不要盲目 `audit fix --force`。
- 对 `xlsx` 制定替代方案，因为 audit 明确无修复。

## 建议修改

### [建议修改] `node:http + 手写路由` 已经接近失控边界

证据：

- `server/src/api.js` 904 行，路由、CORS、静态资源、认证、业务 handler、错误处理混在一个文件。
- `server/src/db.js` 1136 行，schema、迁移、种子、normalize、validate、CRUD、DTO、legacy migration 全在一起。

风险：

手写路由在 demo 阶段很轻，但现在已经承载登录、后台、公开查询、绑定、二维码、静态托管、迁移。继续堆下去，新增用户体系或防丢功能时很容易把权限判断漏在某个分支里。

建议：

- 至少按 `routes`, `handlers`, `services`, `repositories`, `dto`, `middleware` 拆分。
- 把 `requireAdmin`、未来的 `requireUser`、CORS、错误响应做成统一中间层。
- 数据库迁移与业务查询分离，避免一个文件同时承担所有责任。

### [建议修改] 管理台详情页过大，业务流程和 UI 状态强耦合

证据：

- `server/admin/src/views/ClothingDetailView.vue` 1837 行。
- 同一组件内包含主档编辑、批次生成、批次编辑、SN 展开、绑定详情、解绑、删除、导出、二维码下载、日期选择、复制等流程。

风险：

这个文件已经不是“页面组件”，而是一个小系统。任何修复都要穿过大量状态变量：`expandedBatchIds`, `openBatchToolsId`, `expandedBindingSns`, `editingBatchId`, 多个 message 和 loading。后续加审计、权限、导出安全时会更难测。

建议：

- 拆成 `ClothingEditor`, `BatchCreator`, `BatchCard`, `SnRow`, `ExportActions`, `DangerZone`。
- 把导出、日期、绑定展示逻辑提成 composable 或 utils。
- 拆完再补组件级测试或 Playwright E2E。

### [建议修改] 列表查询存在 N+1，批次/SN 增多后后台会明显变慢

证据：

- `server/src/db.js:851-864` 先查最多 500 个 SN，再对每个 SN 调一次 `findGarmentDetailBySn()`。
- `server/src/api.js:307-310` 每个批次再查本批 SN。
- `server/src/api.js:766-768` 衣服详情会对每个批次执行 `batchWithGarments()`。

风险：

现在单次生成最多 500 个 SN，看起来有上限。但多个批次叠加后，后台打开衣服详情会变成多轮查询。SQLite 本地小数据还扛得住，真实数据一多就是慢页面。

建议：

- 为“衣服详情页批次 + SN”设计一次性 join 查询。
- 后台 SN 列表分页或懒加载，不要展开时一次全量塞进响应。
- 对 `clothingId`, `batchId`, `sn`, `status`, `created_at` 的组合查询补索引评估。

### [建议修改] 服务端缺少字段长度和业务格式上限

证据：

- `server/src/db.js:53-60` `cleanString()` 只 trim，不限制长度。
- `server/src/db.js:383-406` 衣服/批次校验只验证必填和“至少填一个批次字段”。
- `server/src/api.js:73-80` 只限制整个 JSON body 为 1MB。

风险：

单个字段可以塞很长文本，影响数据库、页面渲染和导出文件。尤其面料、备注、厂家地址、标准字段会进入公开页和 Excel/CSV。

建议：

- 服务端统一字段 schema：长度、字符集、日期格式、状态枚举。
- 前后端共用或镜像校验规则。
- 对导出字段再做长度截断或显式提示。

### [建议修改] SN 生成使用 `Math.random()`，不适合防伪/防枚举语境

证据：

- `server/src/sn.js:11-19` 用 `Math.random()` 生成 6 位随机段。
- `server/src/sn.js:22-32` 最多重试 50 次保证唯一。

风险：

SN 不是密码，但这是“校服安全防伪码”。可预测性和可枚举性会放大公开查询、绑定抢占和隐私暴露问题。

建议：

- 用 `crypto.randomInt()` 或 `randomBytes()`。
- 考虑更长随机段或引入校验位。
- 对公开查询加服务端限流，避免批量枚举。

### [建议修改] 健康检查暴露数据库路径

证据：

- `server/src/api.js:730-734` `/api/health` 返回 `database: context.config.databasePath`。

风险：

生产环境暴露服务器目录结构没有必要，出错时会给攻击者更多信息。

建议：

- 健康检查只返回 `{ ok: true }`、版本号或匿名化状态。
- 详细路径放服务端日志，不出公网响应。

### [建议修改] 管理台运行时自动 `npm install/build` 不适合生产启动链路

证据：

- `server/src/index.js:4` 启动时直接执行 `ensureAdminBuild()`。
- `server/src/prepare-admin.js:31-40` 用 `execSync()` 同步跑 npm。
- `server/src/prepare-admin.js:79-85` 缺依赖或构建过期时自动 install/build。

风险：

服务启动时联网安装依赖，会让生产启动变慢、不可预测，也扩大供应链风险。路径含空格或 npm 环境不一致时也容易出奇怪问题。

建议：

- 生产环境默认不自动构建，构建产物由 CI/CD 产生。
- 开发环境保留自动构建可以，但用明确开关。
- 安装使用 `npm ci`，不要启动时 `npm install`。

### [建议修改] 文档/记忆文件说的是未来架构，代码实现还是旧安全模型

证据：

- `memory/security-principles.md` 要求服务端身份验证、权限检查、防刷、操作审计。
- `memory/detailed-logic-design.md` 设计了 `users`, `binding_logs`, `lost_reports`。
- `server/src/db.js:100-187` 当前 schema 只有 `admins`, `garment_styles`, `clothes`, `garment_batches`, `garments`。

风险：

文档看起来像“已经验证通过”，实际代码没有用户体系、绑定审计、防丢表。这会误导后续开发和验收。

建议：

- 把 memory 文档标注为“设计草案/未实现”或迁入 roadmap。
- README 增加“当前已实现/未实现”表。
- 每完成一个阶段，补测试和迁移记录，再更新架构状态。

### [建议修改] 测试通过，但覆盖面偏业务 happy path，安全回归网很薄

证据：

- `server/test/api.test.js` 覆盖认证、CRUD、绑定、删除、迁移、静态托管。
- `client/test/fixed-header-layout.test.js:37-96` 是基于正则读 CSS 的布局测试。
- 根 `package.json` 只有 `test`，没有 lint、format、typecheck、E2E。

风险：

现有测试能证明“核心流程能跑”，不能证明“生产环境安全”。公开绑定、CORS 白名单、登录限速、导出注入、PII 默认不可见都没有测试保护。

建议：

- 后端增加安全测试套件。
- 管理台和公开端增加最少量 E2E：登录、生成批次、公开查询、绑定可见性、导出。
- 增加 lint/format 检查，避免 Vue 大文件继续无约束膨胀。

### [建议修改] 管理后台缺少安全响应头

证据：

- `server/src/api.js:229-232` 管理台 HTML 只设置 `Content-Type` 和 `Cache-Control`。
- `server/src/api.js:247-250` 静态资源也只设置 `Content-Type` 和 `Cache-Control`。

风险：

后台 token 放在 localStorage 时，CSP、`X-Content-Type-Options`, `Referrer-Policy`, `Frame-Options`/`frame-ancestors` 这些头更重要。现在没有明显防护。

建议：

- 管理台 HTML 加 CSP，至少限制 script/style/img/connect 来源。
- 加 `X-Content-Type-Options: nosniff`、`Referrer-Policy`、`Cross-Origin-Opener-Policy` 等基础头。
- 如果后台只给内网或固定域名使用，配套部署层也要设头。

### [建议修改] 默认 API 地址对真机/生产不友好

证据：

- `client/src/utils/api.js:1-2` 默认 `http://127.0.0.1:8787`。
- `client/.env.example:5-10` 提醒小程序开发要换局域网 IP，生产要换域名，但代码没有强约束。

风险：

H5 本地好用，不代表手机或小程序真机好用。忘配环境变量时，构建仍然成功，但运行时会请求用户设备自己的 127.0.0.1。

建议：

- 生产构建必须显式提供 API base URL。
- 小程序/H5 使用平台区分配置或运行时配置注入。
- 构建时检查 `VITE_API_BASE_URL`，禁止生产包落到 localhost/127.0.0.1。

## 仅供参考

### [仅供参考] 设计上有亮点，但现在更像“能演示的 MVP”

值得肯定：

- 前台、管理台、后端已经分离，目录边界比一锅粥强。
- SQLite + Node 内置模块让部署心智很轻。
- 三层数据模型 `clothes -> garment_batches -> garments` 方向是对的。
- 后端测试能覆盖主流程，构建也能通过。

但要注意：

- “校服”“学生信息”“防伪码”天然带隐私和信任属性，不能按普通 demo 表单的安全等级处理。
- 当前页面视觉做得比安全模型成熟，容易给人“已经像产品”的错觉。

## 验证记录

已运行并通过：

- `node --version`: `v24.16.0`
- `npm test`: 5 个后端测试全部通过。
- `npm --prefix server/admin run build`: 通过。
- `npm --prefix client run build:h5`: 通过。
- `npm --prefix client run build:mp-weixin`: 通过。
- `npm --prefix server audit --omit=dev`: 0 vulnerabilities。

已运行但有风险输出：

- `npm --prefix client audit --omit=dev`: 30 vulnerabilities，9 high。
- `npm --prefix server/admin audit --omit=dev`: 3 vulnerabilities，2 high，其中 `xlsx` 无可用修复。

没有做：

- 没有启动浏览器做端到端交互 QA。
- 没有跑真实微信开发者工具，只跑了 `mp-weixin` 构建。
- 没有读取 `server/.env` 的真实密钥内容。

## 锐评

一句话：这个项目不是烂，是“demo 写得挺顺，生产安全欠债很诚实地摊在桌面上”。

代码能跑，主流程能测，UI 也花了心思；但隐私、鉴权、审计、删除、导出这些一上线就会被现实拷打的部分还没有跟上。尤其公开绑定和公开展示学生信息这两点，已经不是代码味道问题，而是产品安全边界问题。

如果只当本地演示，它完成度不错；如果要给学校、家长、学生真实使用，现在还不能上线。下一步不建议先继续堆功能，建议先把“谁能绑定、谁能看隐私、谁能删除、谁留下审计”四件事钉牢，再拆大文件和补测试。否则功能越多，后面返工越疼。
