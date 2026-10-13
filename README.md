# ChinaTeam

当前品牌统一为 **ChinaTeam**，正式域名使用 `chinateam.org`，GitHub、Supabase 项目和 Cloudflare 资源标识保留，已有账号与内容不迁移。

支持转发/取消转发、带原帖或新闻文章卡片的引用、帖子详情与引用列表。列表继续使用正文在左、素材在右的样式。帖子发布器共用富文本编辑器，支持粘贴图片、四图排序、代码和外链。阅读偏好可独立选择新闻语言、外部播放器加载方式和转发显示；账户设置增加验证器双重验证。

已发布内容的修改可保存为私密云端草稿，保存时线上版本继续展示；新闻按当前选中语言发布，其他未发布译文留在草稿中。并发版本不一致时拒绝覆盖并保留输入。

2026-10-14 已通过官方 CLI 将 ChinaTeam 发件人、13 类邮件主题/正文及 7 项安全通知保存到 Supabase，回读一致；没有替换 Resend 密钥。邮件仍为中英双语，真实投递与第三方 OAuth 品牌审核需要真实账号验证。

后台支持动态五语言分类、内容搜索与状态筛选、总管理员权限和受保护的数据库/R2 监控。操作方式、状态管理边界和剩余生产缺口见 [后台与运维说明](docs/admin-and-operations.md)。

开放论坛与新闻社区。Next.js 16 App Router、React 19、Tailwind CSS v4、React Icons、Supabase。

正式网站：[ChinaTeam](https://chinateam.org)。`www.chinateam.org` 自动跳转主域并保留路径及查询参数。

域名迁移、Google / X / GitHub、Supabase 与 Resend 的逐项填写指南见 [登录与域名配置](docs/auth-and-domains.md)。全部 13 类品牌邮件的 [配置说明](supabase/templates/README.md) 与 [可视化复制页面](supabase/templates/preview.html) 已备齐；需单独保存到 Supabase Auth，不会随网站部署自动生效。

Google 品牌审核的修复说明及准确填写值见 [品牌验证指南](docs/google-brand-verification.md)。

用户可从头像菜单编辑显示名，上传、裁剪、旋转、缩放或移除头像，也可恢复第三方登录头像。Google / GitHub / X 头像与编辑器配图统一存储于 Cloudflare R2；资料、存储服务和部署说明见 [头像与媒体](docs/profile-and-media.md)。

帖子现在不要求标题，支持最多四图、代码块和按需加载的外链内容；个人主页、关注、嵌套回复和账号安全设置共用原有身份与状态系统。具体用法、平台限制与调研依据见 [社交功能说明](docs/social-system.md)。

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

浏览器验证：安装 Playwright Chromium 后执行 `npm run test:browser`。已接入 Supabase 的构建请设置 `LIVE_SUPABASE=1`，验证真实数据读取、后台保护、登录选项、五语言布局和邮箱回调参数。邮箱提交测试拦截请求，不发送邮件；真实 OAuth 需在已配置的提供商项目中联调。

## 路由与国际化

- `/zh-CN/` 简体中文（默认）、`/en/`、`/ja/`、`/es/`、`/zh-TW/`
- `/{locale}/news/` 新闻、筛选、搜索；`?id={article_uuid}` 阅读详情
- `/{locale}/` 与 `/{locale}/community/` 顶部导航、论坛侧边栏与帖子列表；分类、搜索、排序、我的帖子保持 URL 状态，手机侧栏可收起；`community/?id={uuid}` 阅读帖子
- `/{locale}/write/` 成员发帖、草稿与富文本编辑；管理员使用 `?kind=news` 撰写新闻
- `/{locale}/profile/?id={user_uuid}` 公开个人主页、帖子、回复、媒体与关注关系
- `/{locale}/settings/` 个人资料、账号安全、登录绑定与显示偏好
- `/{locale}/bookmarks/` 私人收藏
- `/` 完整公开首页，不依赖 JavaScript 跳转或登录
- `/{locale}/about/` 组织理念、社区公约及政策入口
- `/{locale}/privacy/` 五语言独立隐私政策
- `/{locale}/terms/` 五语言独立使用条款
- `/{locale}/admin/` 管理后台
- `/{locale}/auth/callback/` OAuth 和邮箱登录回调

UI 文案具有五种语言版本，不包含占位文章。真实文章按语言编辑，缺少翻译时提示并展示原文。语言切换保留页面及查询参数。主题与语言偏好保存在浏览器。真实新闻在浏览器加载，适合首版社区；内容专属 SEO、社交卡片及带索引的全文检索可在后续引入服务端渲染或 Supabase 索引。

## Supabase 配置

目标项目：`cznhnupwojmydttdattb`。

1. 按顺序应用 `supabase/migrations/` 内的迁移。目标项目的已执行版本可在 Supabase migration history 中核对，不要重复执行。它们创建 `omni_` 前缀的表、RLS、受控 RPC、注册触发器、评论节流、审计日志、头像配额及首次管理员预约。内部提权函数位于不对 API 暴露的 `omni_private` schema；公开入口使用显式授权的 invoker 函数。
2. 将项目 URL 与 **Publishable key 或 legacy anon key** 设置为 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。它们用于浏览器；绝对不要填入 `service_role`、数据库密码或 OAuth client secret。
3. Supabase Authentication 设置 Site URL 为正式站点源地址；Redirect URLs 添加五个语言的完整回调地址，例如 `https://chinateam.org/zh-CN/auth/callback/`。其他部署域名和本地地址也需逐个加入允许列表。
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

已为 Cloudflare Pages 项目 `omniremix` 配置 GitHub 源、`main` 生产分支、`npm run build` 构建命令和 `out` 输出目录。正式站点源地址为 `https://chinateam.org`。实际部署是否成功请以 Cloudflare deployment 状态为准。

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

站长已在原 Cloudflare Pages 域名完成 Google 登录并确认进入管理中心。2026-10-12 迁移到 ChinaTeam 后，需要按配置指南保存新的 Auth 返回地址，并在新域名重新登录。GitHub / X 完整授权与 Resend SMTP 真实收件仍需联调；服务商入口可访问不代表完整授权已验证。

### OAuth 应用配置值

| 项目 | 值 |
| --- | --- |
| 应用名称 | ChinaTeam |
| 网站 | `https://chinateam.org` |
| Google / GitHub / X 服务商回调 | `https://cznhnupwojmydttdattb.supabase.co/auth/v1/callback` |
| 隐私说明 | `https://chinateam.org/zh-CN/privacy/` |
| 使用条款 | `https://chinateam.org/zh-CN/terms/` |
| Supabase Site URL | `https://chinateam.org` |

Google 选择 Web application；X 使用 OAuth 2.0 的 Web App，只申请登录所需权限。不要把客户端密钥放入 GitHub、前端或聊天。凭据直接填入 Supabase 的对应 Provider。Supabase Redirect URLs 需要覆盖 Cloudflare 和 Sites 下五个 `/{locale}/auth/callback/` 地址。设置固定域名的 `/**` 可以覆盖五种语言，生产环境也可收窄为十个完整回调 URL。

技术依据：[Cloudflare 静态 Next.js](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/)、[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Supabase X OAuth 2.0](https://supabase.com/docs/guides/auth/social-login/auth-twitter)、[Tailwind CSS v4](https://tailwindcss.com/docs/installation/framework-guides/nextjs)。

账号引导、侧栏、统一搜索与内容语言边界见 [社区架构](docs/social-architecture.md)。

X / GitHub 账号归属徽章、个人主页 Star 统计及缓存边界见 [账号关联说明](docs/connected-accounts.md)。X 粉丝数暂不启用。
