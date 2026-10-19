# Teamcn

当前入口以 [pg520.app 域名说明](docs/pg520-domains.md) 为准。主站为 https://pg520.app，www.pg520.app 同时可用；独立后台为 https://teamcn-admin.pages.dev。

当前部署与 C2C 规则见 [架构与运营说明](docs/teamcn-architecture.md)。前台与后台已切换为 Cloudflare 默认域名。商家是用户，最低押金 1,000 USDT，出售自有积分；订单和兑换码共享押金限额。旧新增发行入口已停用。


当前品牌统一为 **Teamcn**，当前使用 Cloudflare 默认域名，GitHub、Supabase 项目和 Cloudflare 资源标识保留，已有账号与内容不迁移。

支持转发/取消转发、带原帖或新闻文章卡片的引用、帖子详情与引用列表。列表继续使用正文在左、素材在右的样式。帖子发布器共用富文本编辑器，支持粘贴图片、四图排序、代码和外链。阅读偏好可独立选择新闻语言、外部播放器加载方式和转发显示；账户设置使用邮箱安全验证码，已移除验证器扫码方式。

已发布内容的修改可保存为私密云端草稿，保存时线上版本继续展示；新闻按当前选中语言发布，其他未发布译文留在草稿中。并发版本不一致时拒绝覆盖并保留输入。

2026-10-15 已通过官方 CLI 将 Teamcn 发件人、13 类邮件主题/正文及 7 项安全通知保存到 Supabase，回读一致；没有替换 Resend 密钥。邮件仍为中英双语，真实投递与第三方 OAuth 品牌审核需要真实账号验证。

后台支持动态五语言分类、内容搜索与状态筛选、总管理员权限和受保护的数据库/R2 监控。操作方式、状态管理边界和剩余生产缺口见 [后台与运维说明](docs/admin-and-operations.md)。

开放论坛与新闻社区。Next.js 16 App Router、React 19、Tailwind CSS v4、React Icons、Supabase。

网站：[Teamcn](https://pg520.app)。canonical 使用该主站地址，Cloudflare 默认地址仍可访问。

域名迁移、Google / X / GitHub、Supabase 与 Resend 的逐项填写指南见 [登录与域名配置](docs/auth-and-domains.md)。全部 13 类品牌邮件的 [配置说明](supabase/templates/README.md) 与 [可视化复制页面](supabase/templates/preview.html) 已备齐；需单独保存到 Supabase Auth，不会随网站部署自动生效。

Google 品牌审核的修复说明及准确填写值见 [品牌验证指南](docs/google-brand-verification.md)。

用户可从头像菜单编辑显示名，上传、裁剪、旋转、缩放或移除头像，也可恢复第三方登录头像。Google / GitHub / X 头像与编辑器配图统一存储于 Cloudflare R2；资料、存储服务和部署说明见 [头像与媒体](docs/profile-and-media.md)。

帖子支持串文：在编辑器点“添加下一则”，每则独立配置图片、外链和代码，整串保存草稿或一次发布；详情页可续写。一次最多 20 则，每则最多 4 图，整串最多 100 则。新串文草稿可保存到云端；续写草稿目前保存于当前设备。

帖子直接写正文，图片一次最多选择四张并自动上传到 Cloudflare；支持批量粘贴/拖入、预览、排序、裁剪、旋转、图片说明、移除及失败重试。正文可以在图片上传时继续编辑，存在未完成附件时禁止发布；已上传的图片随草稿恢复。详情页提供多图相册、键盘与滑动切换。代码块和外链继续复用富文本编辑器。具体用法与状态边界见 [社交功能说明](docs/social-system.md)。

## 本地运行

```sh
npm ci
cp .env.example .env.local
npm run dev
```

开发地址：`http://127.0.0.1:3000`。未提供 Supabase 公钥时展示空列表和接入提示，登录、发布和互动不可用；不再提供示例文章或模拟收藏。配置有效 Supabase URL 和公钥后使用真实数据库。

```sh
npm run typecheck
npm test
npm run build
```

构建输出为 `out/`。使用 Next.js 官方静态导出；数据读取与权限操作由 Supabase 完成，不需要 Node 服务。Webpack 构建避免部分 Windows 环境的 Turbopack 子进程问题。

浏览器验证：安装 Playwright Chromium 后执行 `npm run test:browser`。已接入 Supabase 的构建请设置 `AUTH_FIXTURES=1`，通过隔离模拟请求验证数据读取、后台保护、登录选项、五语言布局和邮箱回调参数。邮箱提交测试拦截请求，不发送邮件；真实 OAuth 需在已配置的提供商项目中联调。

## 路由与国际化

- `/zh-CN/` 简体中文（默认）、`/en/`、`/ja/`、`/es/`、`/zh-TW/`
- `/{locale}/news/` 新闻、筛选、搜索；`?id={article_uuid}` 阅读详情
- `/{locale}/` 与 `/{locale}/community/` 为列表论坛；桌面使用侧边栏，900px 及以下使用全宽内容与底部导航（首页、搜索、发帖、新闻、我的）。“我的”面板提供个人资料、收藏、设置、分类及按权限显示的管理入口。分类、排序、我的帖子保持 URL 状态；`community/?id={uuid}` 阅读帖子
- `/{locale}/write/` 成员发帖、草稿与富文本编辑；管理员使用 `?kind=news` 撰写新闻
- `/{locale}/profile/?id={user_uuid}` 公开个人主页、帖子、回复、媒体与关注关系
- `/{locale}/settings/` 个人资料、账号安全、登录绑定与显示偏好
- `/{locale}/bookmarks/` 私人收藏
- `/` 完整公开首页，不依赖 JavaScript 跳转或登录
- `/{locale}/about/` 组织理念、社区公约及政策入口
- `/{locale}/privacy/` 五语言独立隐私政策
- `/{locale}/terms/` 五语言独立使用条款
- `/{locale}/admin/` 跳转独立后台 `https://tree.teamcn.org/{locale}/`
- `/{locale}/auth/callback/` OAuth 和邮箱登录回调

UI 文案具有五种语言版本，不包含占位文章。真实文章按语言编辑，缺少翻译时提示并展示原文。语言切换保留页面及查询参数。主题与语言偏好保存在浏览器。真实新闻在浏览器加载，适合首版社区；内容专属 SEO、社交卡片及带索引的全文检索可在后续引入服务端渲染或 Supabase 索引。

## Supabase 配置

目标项目：`cznhnupwojmydttdattb`。

1. 按顺序应用 `supabase/migrations/` 内的迁移。目标项目的已执行版本可在 Supabase migration history 中核对，不要重复执行。它们创建 `omni_` 前缀的表、RLS、受控 RPC、注册触发器、评论节流、审计日志、头像配额及首次管理员预约。内部提权函数位于不对 API 暴露的 `omni_private` schema；公开入口使用显式授权的 invoker 函数。
2. 将项目 URL 与 **Publishable key 或 legacy anon key** 设置为 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。它们用于浏览器；绝对不要填入 `service_role`、数据库密码或 OAuth client secret。
3. Supabase Authentication 设置 Site URL 为正式站点源地址；Redirect URLs 添加五个语言的完整回调地址，例如 `https://teamcn.org/zh-CN/auth/callback/`。其他部署域名和本地地址也需逐个加入允许列表。
4. 在 Providers 中启用 Google、GitHub、**X OAuth 2.0（provider: x）** 和 Email。分别在服务商控制台配置 OAuth 应用，把 client ID / secret 放入 Supabase 提供商设置。提供商回调为 `https://cznhnupwojmydttdattb.supabase.co/auth/v1/callback`。
5. 邮箱支持一次性登录链接及密码登录、密码恢复。当前生产项目已使用 Resend SMTP；仍需实际收件验证送达。账号绑定已启用，正式站与 Sites 各五个精确回调已保存。新部署请检查 SMTP、邮件配额以及 `supabase/config.toml` 的声明配置。
6. 当前项目已根据站长明确指定的邮箱，在不公开的 `omni_private.owner_claim` 中设置一次性预约。只有该准确邮箱通过 Supabase 验证后才能领取总管理员权限；用户元数据里的验证标记无效。领取后预约删除，其他注册者保持普通用户。新部署可由数据库管理者设置自己的预约邮箱，或在注册后按准确 UUID 授权，不要使用“第一个注册者自动成为管理员”的逻辑。

```sql
-- Replace the placeholder with the verified user's UUID from Authentication > Users.
update public.omni_profiles
set role = 'super_admin'
where id = 'VERIFIED-USER-UUID';
```

总管理员可以把已有账号设为子管理员或普通用户、停用账号、调整全站公告、评论与发帖开关。总管理员和子管理员可发布新闻，编辑、置顶、锁定、下架、恢复或删除所有新闻和帖子，并编辑或删除评论。普通用户登录后可发帖、管理自己的帖子与评论、点赞和私人收藏。所有角色均由数据库查询，用户元数据不能设置角色。总管理员账号不能通过前台被降级或停用。

评论每位用户至少间隔 10 秒，正文最多 2000 字符；成员新建帖子至少间隔 30 秒。帖子、新闻、前台评论和后台评论共用 Tiptap 编辑器与 JSON 规范；评论使用精简工具栏。编辑和阅读都应用节点、格式与结构白名单，不注入任意 HTML；图片和链接只允许无凭据的 HTTPS 地址。旧文章及旧评论的纯文本继续兼容。所有写操作均受 RLS 或受控函数保护；UI 限制不是权限边界。收藏只向本人开放。编辑权限、角色变更、设置变更及评论编辑、删除会写入审计记录。

## Cloudflare + GitHub

仓库：`https://github.com/chentieshu/NextchinaORG`。

已为 Cloudflare Pages 项目 `omniremix` 配置 GitHub 源、`main` 生产分支、`npm run build` 构建命令和 `out` 输出目录。正式站点源地址为 `https://teamcn.org`。实际部署是否成功请以 Cloudflare deployment 状态为准。

在 Pages 的 production build 环境设置上面的两个 Supabase 公开变量；变量在构建时写入前端，所以变更后需要重新构建。项目中的 `.env.example` 只是示例，不包含真实公钥。没有公钥的构建展示接入提示和空列表。

当前生产环境已配置 Supabase URL 和 Publishable key。Sites 使用本地 `.env.local` 构建出的同一静态产物；`NEXT_PUBLIC_*` 是构建变量，不能用 Sites 的运行时变量代替。重新构建前确保本地或构建平台已配置这两个公开变量。

`main` 推送自动触发 Pages 部署。GitHub Actions 同时执行类型检查、数据库权限测试和构建。自动部署与 CI 并行；需要合并门禁时，在 GitHub branch protection 中把 Quality checks 设为必须通过。

Sites 的 `.openai/hosting.json` 绑定同一代码的独立私有 Sites 预览。Sites 发布使用其原生版本机制，Cloudflare Pages 使用上述 GitHub 集成。

## 插拔式结构与 UGC

```text
src/app/                 Next.js 页面与语言路由
src/components/          共享布局、登录、全局状态
src/modules/news/        新闻、阅读、收藏、评论
src/modules/forum/       论坛首页、帖子列表与个人草稿
src/modules/social/      公开个人主页、关注与账号设置
src/modules/editor/      五语言富文本写作空间
src/modules/admin/       帖子、新闻、评论、用户及全站管理
src/modules/about/       组织介绍与规则
src/modules/registry.ts  模块能力说明
src/lib/                 语言、类型、Supabase 与内容适配
supabase/migrations/     可版本管理的数据库迁移
tests/                   PostgreSQL 权限与浏览器交互验证
```

论坛已开放，成员帖子与管理员新闻共用内容表，通过 `content_type` 和数据库权限区分。`ugc_enabled` 可由总管理员关闭；管理员仍可管理内容。锁定阻止成员编辑及新增评论，下架后作者不能自行恢复。`omni_submissions` 仍是未开放写入的独立预留审核表。新闻和论坛使用服务端筛选、搜索、排序及每页 20 条分页；收藏同样分页，后台和每层回复每页 30 条。列表返回正文摘录与轻量素材预览，不传输完整富文本。当前搜索匹配所有语言的标题、摘要与正文，超大规模全文检索仍需要索引或独立服务。详见 [论坛与写作说明](docs/forum-upgrade.md)。

2026-10-13 社交迁移 `20261013052519` 已应用，原有 2 个账号、2 篇内容和 1 条评论保留。迁移插件及 TCP 连接失败后，通过官方 CLI 的 HTTPS 管理接口在同一事务内应用并记录版本；迁移历史与本地文件一致。

## 验证与边界

`npm test` 在嵌入式 PostgreSQL (PGlite) 中实际执行迁移与权限场景，覆盖匿名草稿隔离、用户元数据提权阻断、发布限制、收藏隐私、互动身份、评论节流、停用账号、编辑者与总管理员边界、帖子归属、发帖节流、锁定/下架、防止成员发布新闻、评论编辑及审计。

2026-10-12 已应用论坛、统一内容分页和详情统计迁移，原有新闻完整保留。PGlite 测试验证跨角色权限；浏览器以拦截的后端验证成员发帖、富文本评论、管理员管理、登录异常恢复、分页搜索竞态、草稿冲突与离线写作，不向生产库写入测试内容。线上只读检查确认论坛开关与新字段生效。安全检查仍有一项原有 Auth 提示：未开启 [泄露密码保护](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)；私有管理员预约表无客户端策略为有意拒绝所有访问。

2026-10-12 上线复查时邮箱、Google、GitHub 已启用；Google、GitHub、X 三个授权入口均返回正确的服务商跳转。当前项目的公开 Auth settings 没有返回 `x` 字段，因此在验证 X OAuth 2.0 授权入口后，设置 `NEXT_PUBLIC_SUPABASE_X_ENABLED=true` 作为该字段缺失时的显示回退。服务端明确返回 `x:false` 时仍禁用按钮。网站登录面板读取提供商状态，未启用项显示“暂未开放”。

站长已在原 Cloudflare Pages 域名完成 Google 登录并确认进入管理中心。2026-10-12 迁移到 Teamcn 后，需要按配置指南保存新的 Auth 返回地址，并在新域名重新登录。GitHub / X 完整授权与 Resend SMTP 真实收件仍需联调；服务商入口可访问不代表完整授权已验证。

### OAuth 应用配置值

| 项目 | 值 |
| --- | --- |
| 应用名称 | Teamcn |
| 网站 | `https://teamcn.org` |
| Google / GitHub / X 服务商回调 | `https://cznhnupwojmydttdattb.supabase.co/auth/v1/callback` |
| 隐私说明 | `https://teamcn.org/zh-CN/privacy/` |
| 使用条款 | `https://teamcn.org/zh-CN/terms/` |
| Supabase Site URL | `https://teamcn.org` |

Google 选择 Web application；X 使用 OAuth 2.0 的 Web App，只申请登录所需权限。不要把客户端密钥放入 GitHub、前端或聊天。凭据直接填入 Supabase 的对应 Provider。Supabase Redirect URLs 需要覆盖 Cloudflare 和 Sites 下五个 `/{locale}/auth/callback/` 地址。设置固定域名的 `/**` 可以覆盖五种语言，生产环境也可收窄为十个完整回调 URL。

技术依据：[Cloudflare 静态 Next.js](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/)、[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Supabase X OAuth 2.0](https://supabase.com/docs/guides/auth/social-login/auth-twitter)、[Tailwind CSS v4](https://tailwindcss.com/docs/installation/framework-guides/nextjs)。

账号引导、侧栏、统一搜索与内容语言边界见 [社区架构](docs/social-architecture.md)。

X / GitHub 账号归属徽章、个人主页 Star 统计及缓存边界见 [账号关联说明](docs/connected-accounts.md)。X 粉丝数暂不启用。

## TRON 积分钱包

`src/modules/wallet` 是独立的钱包模块，`workers/wallet` 是只读链上核验服务。1 USDT = 100 积分；账本以整数 micro-USDT 保存（1 积分 = 10,000 单位），不经过浮点货币计算。充值积分可打赏，打赏收入可提现。最低提现 1 USDT，手续费为申请金额的 1%，仅在不足 0.000001 USDT 时向上取整；申请 1 USDT，净到账 0.99 USDT。平台支付链上 TRX/资源费用。

链上转账不会直接给浏览器回调。流程为：登录用户创建充值订单 → 显示 QR 地址和精确应付金额 → 任意支持完整精度的 TRC20 钱包或交易所直接转账 → Cloudflare 定时发现交易 → solidified 节点核验 USDt 合约、成功回执及 Transfer 日志 → Supabase 事务记账 → 钱包页面刷新余额。前端不能提交哈希认领别人的充值，也没有增加余额或标记提现已付款的权限。

### 首次配置

1. 应用全部 `20261015` 钱包迁移（包含 `chinateam_wallet_deposit_orders`）。默认关闭充值、打赏与提现，不影响论坛。部署 `chinateam-wallet` Worker；它不持有钱包私钥、不构造或广播付款交易。
2. 为 Worker 配置独立随机 64 位十六进制 Secret `WALLET_GATEWAY_KEY`。数据库 `omni_private.wallet_gateway.secret_hash` 只存该字符串 UTF-8 字节的 SHA-256 十六进制摘要。切勿使用 Supabase service role 或钱包私钥代替。
3. 在 [TronGrid](https://www.trongrid.io/) 创建 API Key，直接添加到 Cloudflare → Workers & Pages → **chinateam-wallet** → Settings → Variables and Secrets，类型选 Secret，名称 **TRONGRID_API_KEY**。切勿发到聊天、提交 Git 或放入 `NEXT_PUBLIC_*`。
4. 平台收款及人工提现地址为 `TA2hxtb3asN8LUCiDX9PUMsdYQNNY5SRNA`。用户输入 1–10,000 USDT（两位小数），服务端创建 30 分钟订单，前端显示收款地址、地址二维码、精确应付金额和积分。无需 TronLink、签名、付款地址绑定或私钥。二维码仅含地址；付款方须另行输入完整精确金额。
5. 不需要地址池和归集。共用一个收款地址，用所选金额 + 0.000001–0.009999 USDT 的唯一尾数识别账号，全部收到金额兑换积分。每个精确金额永久属于首次分配的账号，不随过期释放，从而避免旧订单迟到款记入他人。单账号同时仅一个待付款订单；30 秒间隔、每天最多 30 单、最多 20 种基础金额。同账号相同基础金额复用原尾数；每个 0.01 USDT 区间最多 9,999 个账号，容量用尽拒绝创建并要求选择另一金额。这个模式适合当前规模，不能无限扩容；未来扩大规模需独立地址/服务商方案。交易所到账必须支持完整六位小数，不能取整、拆分或从应付金额里扣费。错误金额、创建前转账、未知来款仅保留待对账记录，不能凭交易哈希认领。旧地址分配入口和付款地址绑定 API 已关闭，历史账本保留。
6. 等待后台出现最近 5 分钟内的监听连接，确认收款地址正确后，由总管理员开放资金功能。先用自控测试账号小额走通充值、打赏、提现和对账，再扩大范围。当前自动化测试均使用隔离数据，不能替代真实主网验收。新加坡运营主体应在开放可提现资金业务前核实适用的支付及数字代币服务要求；这些技术限制不等同于法律资格确认。

### 人工提现及运维

- 申请时冻结打赏收入，用户不能同时花费这部分积分；待审核可取消或由总管理员拒绝并解冻。总管理员完成邮箱验证码验证后点击“开始处理”，然后**从配置的平台收款地址**向页面指定收款地址支付精确净金额。点击开始处理不会转账。勿重复支付不确定结果的交易。
- 付款后填入原交易哈希，Worker 验证已最终确认的 USDT 事件、付款方、收款方、金额及时间后完成账本结算。广播成功或暂未查到回执时保持冻结；不能手动跳过核验标为已付款。处理中申请不提供普通取消按钮；付款失败等异常需人工对账后通过经审计的补偿流程处理，不能直接改余额。
- 所有写入在数据库内原子完成。唯一交易哈希+日志序号防重复入账；请求 UUID 防重复扣款；日志不可覆盖、借贷总和必须为零。不同积分桶分别记录，后台显示余额与待处理提现。暂停功能不丢弃已有订单的有效到账，包括原金额迟到款。未匹配的来款保留交易记录，不提供凭哈希直接认领入口。
- 监听每分钟运行；健康探测只读取最终确认的区块头（`walletsolidity/getblock` + `detail:false`）。所有带凭据的请求使用 `redirect:manual` 并拒绝非成功响应，兼容 Workers 且不会将密钥跟随跳转。单次最多 5 个地址、8 次回执核验，每页 20 条，租约防重叠，失败不前移游标。完整扫描后重新遍历历史以补偿延迟索引。大量地址或长历史会增加到账延迟；扩大规模前需改成分片队列及增量扫描+定期回补，并按 TronGrid 配额调整预算。
- `/health` 只报告密钥是否存在，不保证上游实时健康。后台 heartbeat、Cloudflare `wallet_scan` / `wallet_scan_failed` 日志及账本平衡需持续检查；尚未接入外部告警或自动付款；直接收款无需归集。API Key 缺失时任务不访问链服务，资金功能保持关闭。
- 检查命令：`npm run typecheck`、`npm test`、`npm run build`、`AUTH_FIXTURES=1 npm run test:browser`。浏览器资金接口使用测试夹具，不写生产交易。`tests/wallet-runtime.test.mjs` 在真实 workerd 运行时中拦截全部外部请求，覆盖扫描、204 响应以及重定向拒绝；不能仅以 Node 的 Fetch 模拟代替 Worker 验收。钱包 Worker 单独部署，不随 Pages 静态构建自动更新。

协议依据：[TRON 最终确认](https://developers.tron.network/docs/confirmation-semantics)、[TRC20 历史查询](https://developers.tron.network/docs/get-trc20-transaction-history)、[Tether 官方合约](https://tether.to/en/supported-protocols/)。

### 邮箱安全验证

Supabase Auth 经现有 Resend SMTP 发送 8 位验证码，10 分钟过期、至少 60 秒发送间隔。设置页不自动发信；验证码只交给 Supabase 验证，不写入本地存储。验证码验证使用独立临时 Auth 客户端，确认仍为原账号后再安装新会话，避免账户切换中的迟到响应覆盖登录状态。

资金开关、提现、提现审核和付款核验通过统一服务端校验：当前 JWT 对应的 Auth 会话必须存在，邮箱已确认，且数据库中的 OTP 认证记录在最近 10 分钟内。刷新 token 不延长期限；撤销会话立即失效。拒绝带电话身份的 OTP 证明，以免短信验证码被当作邮箱证明。当前项目使用邮箱与 OAuth，不提供电话登录。它是邮箱再次验证，不是 Supabase AAL2；旧 `wallet_require_mfa` 仅作为历史入口兼容代理调用新校验。开启资金操作仍需总管理员主动确认。

浏览器测试使用 `AUTH_FIXTURES=1` 和模拟接口；统一拦截全部未模拟外部请求，并禁用 Service Worker。真实收信与用户验收由账户本人在网站触发。

### 商家积分市场

总管理员可设置商家、发行或收回商家额度；商家生成一次性兑换码，用户站外购买后兑换到充值积分。发行、占用、兑换和作废均进入原有不可变双边账本。操作入口与恢复说明见 [积分市场文档](docs/points-market.md)。
