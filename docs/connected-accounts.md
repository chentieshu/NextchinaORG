# 账号徽章、平台数据与文章引用

更新：2026-10-14。

## 使用方式

- 在设置 → 关联账号绑定 X 或 GitHub，或使用该平台登录并完成用户名设置。个人主页、帖子、文章和评论共用同一个账号徽章组件。点击 X 徽章进入 X 主页，点击 GitHub 徽章进入 GitHub 主页。
- 徽章表示 OAuth 验证的账号归属，**不代表 X 蓝标、GitHub 官方认证、身份实名或内容背书**。解除绑定后撤下；不会用自填个人网址冒充已绑定。
- GitHub Star 位于个人主页，帖子列表只显示徽章。统计本人所有公开、非 Fork 仓库收到的 Star，不计用户收藏、不计私有仓库，也不计组织仓库。
- 新闻的操作栏新增「引用文章」。引用后发布的仍是普通帖子，不要求标题；内嵌卡片显示新闻标题、摘要，并打开原文。新闻仅管理员可发布。

## 数据与缓存

`omni_public_connections` 只公开通过 Auth `auth.identities` 获取的服务商、第三方 ID、用户名和主页链接。不会读取可编辑的 `user_metadata` 作为证明，也不会公开邮件或 OAuth token。停用或未完成用户名设置的账号不出现在公开资料中。

客户端批量查询徽章，按用户共享短缓存，登录、绑定和解绑时失效，避免列表逐条重复请求。外部计数由 Cloudflare Worker 查询，R2 保存计数与采集时间，不创建第二套用户资料。

GitHub 先按绑定的稳定 numeric ID 解析当前用户名，再逐页列出本人仓库，核验 owner ID、排除 Fork 和私有项、按仓库 ID 去重。6 小时缓存；失败短缓存 15 分钟；旧值最多保留显示 7 天并标明“上次统计”。超过 20 页或请求预算时显示未完成，不把部分和当总数。GitHub 匿名 API 有额度限制，限流不表示 Star 为 0。

可选的 `GITHUB_PUBLIC_TOKEN` 只能作为 Cloudflare Worker Secret 设置。使用仅公开资源、无需额外权限的 Fine-grained token，提高读取额度；不要使用仓库写入、组织管理或 Codex/GitHub CLI 的管理令牌。

**X 粉丝数按站长本轮要求暂不启用**。现有 Supabase X 登录不会返回粉丝数。预留的服务端接口仅在配置 `X_BEARER_TOKEN` 后可用，必须本人登录主动请求；数据库在所有 Cloudflare 节点间限制每账号每 24 小时一次。普通访客浏览不会触发 X API。后续启用前核对 X 开发者账户的 API 计费和预算。X 数据超过 24 小时不继续展示。

## 验证与已知边界

- 权限测试覆盖伪造 metadata、直接修改 Auth 身份、解绑、停用、跨账号同步和并发冷却。
- 文章引用只读取已发布版本；私密草稿和未发布译文不会进入引用卡片。原文撤下后显示不可用。
- 仓库列表在翻页期间发生增删，官方 API 不提供事务快照；计数是采集时近似状态，不用于权限或财务结算。
- 平台改名后计数按稳定 ID 查询；徽章的文字与链接来自最近一次 OAuth 资料，重新使用该平台登录可更新它们。

官方依据：[Supabase 身份](https://supabase.com/docs/guides/auth/identities)、[GitHub 按 ID 查询用户](https://docs.github.com/en/rest/users/users#get-a-user-using-their-id)、[GitHub 仓库列表](https://docs.github.com/en/rest/repos/repos#list-repositories-for-a-user)、[X 用户公开指标](https://docs.x.com/x-api/users/get-user-by-id)、[X API 计费](https://docs.x.com/x-api/getting-started/pricing)。
