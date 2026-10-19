# pg520.app 域名配置

2026-10-19：Teamcn 主站绑定 `https://pg520.app` 和 `https://www.pg520.app`，均对应 Cloudflare Pages 项目 `omniremix`。两者均可访问；页面 canonical 与分享链接统一使用不带 www 的地址。

| 服务 | 地址 |
| --- | --- |
| 主站 | https://pg520.app |
| 主站别名 | https://www.pg520.app |
| Cloudflare 默认入口 | https://omniremix.pages.dev |
| 独立后台 | https://teamcn-admin.pages.dev |
| 媒体 | https://nextchina-media.chentieshu520.workers.dev |
| 钱包与行情入口 | https://chinateam-wallet.chentieshu520.workers.dev |

Cloudflare DNS 中根域和 www 均为代理 CNAME，目标 `omniremix.pages.dev`，并分别加入该 Pages 项目的自定义域名。此前解绑的 NextChina、ChinaTeam、Teamcn 域名不恢复。

两个 Pages 项目的 `NEXT_PUBLIC_SITE_URL` 为 `https://pg520.app`，`NEXT_PUBLIC_ADMIN_URL` 保持默认后台地址。Supabase Site URL 使用 `https://pg520.app`；五种语言的 `/auth/callback/` 精确允许地址覆盖两个新域名、默认主站、独立后台与现有 Sites 预览站。

Google、GitHub、X 的 OAuth 回调仍为 `https://cznhnupwojmydttdattb.supabase.co/auth/v1/callback`。服务商应用展示的主页和隐私政策如需更新，使用 `https://pg520.app` 和 `https://pg520.app/zh-CN/privacy/`；OAuth 凭据不变。

邮件模板中的品牌和隐私链接使用新主站。Resend SMTP 及原发信域名不变。媒体和钱包 Worker 的 CORS 增加两个新域名，保留默认站点与后台；私有价格 Worker 不开放公网。历史媒体和市场引用继续兼容，账号、积分和交易账本不迁移。

在新域名首次使用时需要重新登录；不同域名的浏览器会话不会自动共享。
