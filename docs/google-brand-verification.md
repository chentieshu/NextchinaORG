# Google 品牌审核修复与重新提交

2026-10-12，根据 Google Auth Platform 的审核截图调整网站。网站修复不代表 Google 已通过审核。

## 网站已经做的修正

- 根首页 `/` 现在直接输出完整页面，不再只有 JavaScript 跳转和口号。
- 首页清楚说明科技新闻、管理员发布、用户点赞/收藏/评论及 Google 登录用途。
- 首页、新闻与政策可匿名访问；静态 HTML 包含用途与政策链接，阅读这些说明不依赖 JavaScript。
- 五语言独立隐私政策详述账号和 Google 资料、用途、Supabase/Cloudflare/Resend、公开评论与私人收藏、浏览器存储、保留和删除、撤销授权、安全与联系。
- 五语言独立条款明确服务范围及内容规则。本站不提供图像或视频生成服务；Google 数据不用于通用 AI 训练；禁止未经同意的私密影像。
- 页脚和登录面板指向独立政策页面；旧 about 锚点保留简要说明及完整政策入口。
- 支持邮箱已按站长明确授权公开为 `chentieshu520@gmail.com`。

## Google 控制台需要保存的字段

打开 [Google Auth Platform Branding](https://console.cloud.google.com/auth/branding?project=shuxue-508602)。

| 字段 | 值 |
| --- | --- |
| App name | `ChinaTeam`，与网站完全一致；不要继续使用 `NextCHINA` |
| User support email | `chentieshu520@gmail.com` |
| App home page | `https://nextchina.org/` |
| Privacy policy | `https://nextchina.org/zh-CN/privacy/` |
| Terms of service | `https://nextchina.org/zh-CN/terms/` |
| Authorized domains | 包含 `nextchina.org`，保留现有回调所需配置 |

不再使用 `about/#privacy` 作为送审的隐私政策地址。完整政策页与首页链接保持一致。

OAuth 客户端的回调仍为 `https://cznhnupwojmydttdattb.supabase.co/auth/v1/callback`，不要为了品牌审核改成网站首页。当前公开授权请求的 Google scope 为 `email profile`；控制台只保留登录所需基本身份权限，不申请 Gmail、Drive、Calendar 等无关权限。

## 域名所有权

站长已报告在 Google Search Console 完成验证。我们也在 Cloudflare DNS 和公共 Google DNS 中核验到其提供的验证 TXT；没有创建重复记录。DNS 中有 TXT 记录不能替代 Google 控制台的最终验证状态。

确认 Search Console 的域名所有者 Google 账号同时是当前 Cloud 项目的 Owner 或 Editor。保留验证记录。按照此次 Google 错误提示，完成所有权验证后等待 24 小时，让 Google 系统更新，再重新提交。

## 重新验证

保存草稿品牌信息后点击 Verify Branding / 重新验证；验证通过且显示 Ready to publish 后，再点击 Publish branding。若有正在进行的审核，按 Google 页面提示先取消审核后才能修改品牌。

若仍提示首页在登录后，但无痕访问上述地址已正常显示公开内容，可申请人工审核，说明：公开首页无需登录，登录只用于互动；附上首页、独立隐私政策和条款地址。最后一项 AI 私密影像提示本身不证明网站存在该功能，不应据此对未发生的行为作承认。

官方依据：[品牌验证](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)、[首页要求](https://support.google.com/cloud/answer/13807376?hl=en)、[Search Console 所有权](https://support.google.com/webmasters/answer/9008080?hl=en)、[Google 用户数据政策](https://developers.google.com/terms/api-services-user-data-policy)。
