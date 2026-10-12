# OmniRemix

科技新闻与社区官网。Next.js 16 App Router、React 19、Tailwind CSS v4、React Icons、Supabase。

## 本地运行

```sh
npm ci
cp .env.example .env.local
npm run dev
```

开发地址：`http://127.0.0.1:3000`。未提供 Supabase 公钥时进入明确标注的演示模式：文章为示例，点赞与收藏仅保存在浏览器，登录和评论不可用。配置有效 Supabase URL 和公钥后使用真实数据库，空数据库不会混入示例文章。

```sh
npm run typecheck
npm test
npm run build
```

构建输出为 `out/`。使用 Next.js 官方静态导出；数据读取与权限操作由 Supabase 完成，不需要 Node 服务。Webpack 构建避免部分 Windows 环境的 Turbopack 子进程问题。

浏览器验证：安装 Playwright Chromium 后执行 `npm run test:browser`。当前用例验证演示模式；真实 OAuth 需在已配置的提供商项目中联调。

## 路由与国际化

- `/zh-CN/` 简体中文（默认）、`/en/`、`/ja/`、`/es/`、`/zh-TW/`
- `/{locale}/news/` 新闻、筛选、搜索；`?id={article_uuid}` 阅读详情
- `/{locale}/community/` 围绕新闻的讨论，当前不开放普通用户发帖
- `/{locale}/bookmarks/` 私人收藏
- `/{locale}/about/` 组织理念、社区公约、隐私说明与使用条款
- `/{locale}/admin/` 管理后台
- `/{locale}/auth/callback/` OAuth 和邮箱登录回调

UI 文案与演示文章具有五种语言版本。真实文章按语言编辑，缺少翻译时提示并展示原文。语言切换保留页面及查询参数。主题与语言偏好保存在浏览器。真实新闻在浏览器加载，适合首版社区；新闻专属 SEO、社交卡片及大规模全文检索可在后续引入服务端渲染或 Supabase 索引。

## Supabase 配置

目标项目：`cznhnupwojmydttdattb`。

1. 在目标项目执行 `supabase/migrations/202610120001_omniremix.sql`。脚本在事务内创建 `omni_` 前缀的表、RLS、受控 RPC、注册触发器、评论节流与审计日志。通过 Supabase migrations 管理运行记录，不要重复执行同一迁移。
2. 将项目 URL 与 **Publishable key 或 legacy anon key** 设置为 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。它们用于浏览器；绝对不要填入 `service_role`、数据库密码或 OAuth client secret。
3. Supabase Authentication 设置 Site URL 为正式站点源地址；Redirect URLs 添加五个语言的完整回调地址，例如 `https://omniremix.pages.dev/zh-CN/auth/callback/`。其他部署域名和本地地址也需逐个加入允许列表。
4. 在 Providers 中启用 Google、GitHub、**X OAuth 2.0（provider: x）** 和 Email。分别在服务商控制台配置 OAuth 应用，把 client ID / secret 放入 Supabase 提供商设置。提供商回调为 `https://cznhnupwojmydttdattb.supabase.co/auth/v1/callback`。
5. 邮箱使用一次性登录链接。正式开放注册前配置自己的 SMTP，并检查 Supabase 的邮件发送限制；默认邮件服务不能替代正式 SMTP 配置。
6. 首位站长先完成注册，再在 Supabase SQL Editor 中按准确的用户 UUID 授予总管理员。不要按邮箱模糊匹配，不要使用“第一个注册者自动成为管理员”的逻辑。

```sql
-- Replace the placeholder with the verified user's UUID from Authentication > Users.
update public.omni_profiles
set role = 'super_admin'
where id = 'VERIFIED-USER-UUID';
```

总管理员可以把已有账号设为子管理员或普通用户、停用账号、调整全站公告和评论开关。子管理员可发布、编辑、归档新闻和删除违规评论。普通用户可点赞、私人收藏、评论和删除自己的评论。所有角色均由数据库查询，用户元数据不能设置角色。总管理员账号不能通过前台被降级或停用。

评论每位用户至少间隔 10 秒，正文最多 2000 字符。文章只渲染纯文本，HTTPS 来源链接经过检查。所有写操作均受 RLS 或受控函数保护；UI 限制不是权限边界。收藏只向本人开放。编辑权限、角色变更、设置变更及评论删除会写入审计记录。

## Cloudflare + GitHub

仓库：`https://github.com/chentieshu/NextchinaORG`。

已为 Cloudflare Pages 项目 `omniremix` 配置 GitHub 源、`main` 生产分支、`npm run build` 构建命令和 `out` 输出目录。正式站点源地址为 `https://omniremix.pages.dev`。实际部署是否成功请以 Cloudflare deployment 状态为准。

在 Pages 的 production build 环境设置上面的两个 Supabase 公开变量；变量在构建时写入前端，所以变更后需要重新构建。项目中的 `.env.example` 只是示例，不包含真实公钥。没有公钥的构建会明确使用演示模式。

`main` 推送自动触发 Pages 部署。GitHub Actions 同时执行类型检查、数据库权限测试和构建。自动部署与 CI 并行；需要合并门禁时，在 GitHub branch protection 中把 Quality checks 设为必须通过。

Sites 的 `.openai/hosting.json` 绑定同一代码的独立私有 Sites 预览。Sites 发布使用其原生版本机制，Cloudflare Pages 使用上述 GitHub 集成。

## 插拔式结构与 UGC

```text
src/app/                 Next.js 页面与语言路由
src/components/          共享布局、登录、全局状态
src/modules/news/        新闻、阅读、收藏、评论
src/modules/admin/       管理中心与多语言编辑器
src/modules/about/       组织介绍与规则
src/modules/registry.ts  模块能力说明
src/lib/                 语言、类型、Supabase 与内容适配
supabase/migrations/     可版本管理的数据库迁移
tests/                   PostgreSQL 权限与浏览器交互验证
```

UGC 模块与 `omni_submissions` 审核表已预留，当前无写入授权，`ugc_enabled` 受数据库约束保持关闭。未来开放时应新增迁移、投稿编辑器、审核工作流与滥用防护，再开启权限；不能只修改前端开关。第一版新闻列表读取最近 500 篇，后台按每页 50 条管理。超过这一规模时应加入服务端分页和搜索。

## 验证与边界

`npm test` 在嵌入式 PostgreSQL (PGlite) 中实际执行迁移与权限场景，覆盖匿名草稿隔离、用户元数据提权阻断、发布限制、收藏隐私、互动身份、评论节流、停用账号、编辑者与总管理员边界、UGC 禁写及审计。

这些测试不代表已在目标 Supabase 项目执行迁移；项目接入和四种登录方式的真实联调，需要该项目的授权、公开 key 和 OAuth/邮件配置。

技术依据：[Cloudflare 静态 Next.js](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/)、[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Supabase X OAuth 2.0](https://supabase.com/docs/guides/auth/social-login/auth-twitter)、[Tailwind CSS v4](https://tailwindcss.com/docs/installation/framework-guides/nextjs)。
