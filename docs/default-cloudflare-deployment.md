# Cloudflare 默认入口

2026-10-16：主站改用桌面顶部导航，移动端保留底部导航与账号面板。管理后台仍为独立应用。品牌保持 Teamcn。

| 服务 | 当前地址 |
| --- | --- |
| 主站 | https://omniremix.pages.dev |
| 管理后台 | https://teamcn-admin.pages.dev |
| 图片与上传 | https://nextchina-media.chentieshu520.workers.dev |
| 钱包与 BTC 展示行情 | https://chinateam-wallet.chentieshu520.workers.dev |

主站的 nextchina.org、chinateam.org、teamcn.org 及其 www，后台 tree.teamcn.org，以及本项目的 media / wallet 自定义域名均解除绑定。对应 Pages CNAME 一并移除，域名注册、DNS zone、邮件记录和其他项目保持原状。价格采集 Worker `teamcn-prices` 继续仅通过服务绑定访问，不开启公网入口。

## 配置与兼容

- 主站和后台构建时使用 `.env.example` 中的两个站点 URL；Workers 地址分别在 `src/lib/media-origin.ts` 与 `src/lib/site.ts` 集中定义。
- Supabase Site URL 使用主站默认地址。回跳白名单保留主站、后台与原 Sites 预览站的五语言 `/auth/callback/` 精确路径。Google、GitHub、X 的服务商回调仍为 `https://cznhnupwojmydttdattb.supabase.co/auth/v1/callback`。
- 邮件模板的网站与隐私链接同步默认主站。SMTP 继续使用现有 Resend 发件域 `mail.nextchina.org`，不会删除其邮件 DNS。无需更换 SMTP、OAuth 或钱包密钥。
- 历史图片 URL 在读取、预览、编辑时映射到默认媒体地址，R2 对象 key 与存储内容不变。旧预测市场引用继续可识别，生成的新引用使用默认主站。
- 图片帖子校验支持新媒体地址，保留四图上限。迁移不触及积分余额、资金开关、订单或账户角色。

## 验证

`npm test` 覆盖 61 项测试，含历史图片、新媒体地址、纯图片帖子和伪造域名拒绝。138 项隔离浏览器回归覆盖五语言、响应式导航、独立后台、上传与交易界面。生产验证只读取公开页面和健康状态，不发送验证码或创建真实交易。
