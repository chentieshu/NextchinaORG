# ChinaTeam：域名、社交登录与邮件配置

更新日期：2026-10-14。品牌为 **ChinaTeam**，主站为 `https://chinateam.org`。域名大小写不影响访问；配置统一使用小写。

## 已完成与待保存的项目

- Cloudflare Pages 已绑定 `chinateam.org` 和 `www.chinateam.org`，两者验证和证书状态均为 active。
- `www.chinateam.org` 通过 Cloudflare 301 跳转主站，保留路径与查询参数。
- 全站五语言品牌、标题、登录面板、后台与页脚已替换；生产构建的 `NEXT_PUBLIC_SITE_URL` 已改为 `https://chinateam.org`。
- Resend 中 `mail.nextchina.org` 已 verified，Sending enabled，打开跟踪与点击跟踪均关闭。
- Supabase Site URL、五语言新旧域名回调、13 类邮件链接已通过官方工具保存；Google / GitHub / X 控制台的品牌网址仍需按下文填写。邮件沿用已验证的 login@mail.nextchina.org，避免切换未经验证的发件域。

现有 Cloudflare Pages 项目的内部名称仍是 `omniremix`，GitHub 仓库仍为 [chentieshu/NextchinaORG](https://github.com/chentieshu/NextchinaORG)。这两项无需重建。现有账号、文章、权限和数据库表继续使用同一 Supabase 项目。

## 先分清两个回调地址

Google / GitHub / X 控制台中的 OAuth 回调统一为：

```text
https://cznhnupwojmydttdattb.supabase.co/auth/v1/callback
```

它负责把服务商授权交给 Supabase。只是更换网站域名，不需要更换此地址，也不需要重新生成已生效的 Client ID / Secret。

Supabase 的 Redirect URLs 是登录完成后回到本站的地址，例如：

```text
https://chinateam.org/zh-CN/auth/callback/
```

这两个位置不能互换，也不要将服务商的回调填成网站首页。

## 1. Supabase

打开 [Authentication → URL Configuration](https://supabase.com/dashboard/project/cznhnupwojmydttdattb/auth/url-configuration)。

Site URL 设置为：

```text
https://chinateam.org
```

在 Redirect URLs 中逐条添加并保存：

```text
https://chinateam.org/zh-CN/auth/callback/
https://chinateam.org/en/auth/callback/
https://chinateam.org/ja/auth/callback/
https://chinateam.org/es/auth/callback/
https://chinateam.org/zh-TW/auth/callback/
```

`www` 会在加载应用前转到主域，因此网站在主域发起和完成登录，无需从 `www` 发起独立登录。原先的 Pages 与 Sites 预览地址可以在继续使用它们时保留；不要将生产 Site URL 再设为 localhost。生产回调推荐逐条配置准确路径。

然后打开 Authentication → Sign In / Providers，检查 Google、GitHub、X / Twitter **OAuth 2.0** 与 Email 已启用。Email 保持邮箱验证；允许注册时，新邮箱通过登录链接自动创建普通用户。

本站使用 Supabase 浏览器客户端 PKCE 登录。新域名不会继承旧域名的浏览器会话，需要在新站重新登录；使用原有账号即可，已有总管理员角色保留。

依据：[Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)、[Email 登录](https://supabase.com/docs/guides/auth/auth-email-passwordless)。

## 2. Google

打开 [现有 Google Cloud 项目](https://console.cloud.google.com/auth/overview?project=shuxue-508602)，进入 Google Auth Platform。

1. **Branding**：App name 改为 `ChinaTeam`；User support email 选择站长已验证邮箱。
2. App home page 填 `https://chinateam.org`。
3. Privacy policy 填 `https://chinateam.org/zh-CN/privacy/`；Terms of service 填 `https://chinateam.org/zh-CN/terms/`。
4. Authorized domains 添加 `chinateam.org`（不带协议或路径）。保留当前 Supabase 回调域相关配置；Google 如提示域名所有权验证，按页面要求在 Search Console 验证根域。
5. **Clients**：打开现有 Web application OAuth 客户端。Authorized JavaScript origins 添加 `https://chinateam.org` 和 `https://www.chinateam.org`。
6. Authorized redirect URIs 保持上方 Supabase 完整回调地址。
7. **Audience**：测试阶段将测试账号加入 Test users；向公众开放时按 Google 控制台完成 Publish / verification 流程。保存品牌不等于 Google 已完成审核。
8. **Data Access**：登录只需 `openid`、`userinfo.email`、`userinfo.profile`，不要额外申请 Drive、Gmail 等权限。
9. Supabase Google Provider 保持当前同一客户端的 Client ID / Secret。只有更换 OAuth 客户端或轮换密钥时才更新这两项。

依据：[Supabase Google 配置](https://supabase.com/docs/guides/auth/social-login/auth-google)。

## 3. GitHub

打开 [GitHub Developer settings](https://github.com/settings/developers) → **OAuth Apps** → 现有应用。

| 字段 | 填写值 |
| --- | --- |
| Application name | `ChinaTeam` |
| Homepage URL | `https://chinateam.org` |
| Application description | `An independent technology news community.` |
| Authorization callback URL | `https://cznhnupwojmydttdattb.supabase.co/auth/v1/callback` |

点击 Update application。Supabase GitHub Provider 继续使用现有 Client ID / Secret；无需开启 Device Flow。OAuth App 与代码仓库、Cloudflare GitHub 部署集成是不同设置，修改登录品牌不需要断开部署集成。

依据：[Supabase GitHub 配置](https://supabase.com/docs/guides/auth/social-login/auth-github)。

## 4. X

打开 [现有 X 开发者账号](https://console.x.com/accounts/2102246578647973888)，选择目前用于登录的应用 → Settings / User authentication settings。

1. 应用名称改为 `ChinaTeam`。
2. 使用 OAuth 2.0；Type of App 选择 **Web App / Automated App or Bot**（名称以控制台实际选项为准）。
3. 开启 **Request email from users**；仅登录时使用 Read 权限，不申请发推或私信写入权限。
4. Callback URI / Redirect URL 填上方 Supabase 回调。
5. Website URL 填 `https://chinateam.org`；Terms of service 与 Privacy policy 使用 Google 配置部分的两个完整链接。
6. 保存。Keys and tokens 中的 **OAuth 2.0 Client ID / Client Secret** 对应 Supabase → X / Twitter (OAuth 2.0)。不要混用旧版 API Key / API Secret 或 OAuth 1.0a。
7. 已正常配置的密钥不需要因改名而重新生成。如果主动轮换，立即在 Supabase 对应 Provider 中同步保存。

代码使用 `provider: 'x'`。当前项目公开 Auth settings 缺少 `x` 字段，已通过真实授权入口核实后保留显示回退环境变量；不要将其作为替代服务端启用配置的开关。

依据：[Supabase X OAuth 2.0 配置](https://supabase.com/docs/guides/auth/social-login/auth-twitter)。

## 5. Supabase + Resend 邮箱登录

Supabase 负责注册、一次性链接与会话；Resend 通过 SMTP 发送邮件。网站已经调用 Supabase `signInWithOtp`，无须将 Resend API key 加到网站前端。

### Resend

打开 [Resend Domains](https://resend.com/domains)，选择 **mail.nextchina.org**：本次已读取到 verified / sending enabled。现有验证 DNS 无需重复添加，点击跟踪继续关闭，避免改写一次性登录链接。

打开 [Resend API Keys](https://resend.com/api-keys) 创建专用密钥：

- Name：`ChinaTeam Supabase SMTP`
- Permission：`Sending access`
- Domain：`mail.nextchina.org`

复制密钥后直接粘贴进下面 Supabase SMTP Password。不要提交 GitHub、填入 `NEXT_PUBLIC_*` 或发送到聊天。

### Supabase SMTP

进入 [Supabase 项目](https://supabase.com/dashboard/project/cznhnupwojmydttdattb) → Authentication → Notifications → Email → **SMTP Settings**，开启 Custom SMTP，填入：

| 字段 | 值 |
| --- | --- |
| Sender email | `login@mail.nextchina.org` |
| Sender name | `ChinaTeam` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | 刚创建的 Resend API key |

保存后检查 Authentication → Rate Limits 的邮件发送限制，并按实际开放规模与 Resend 配额设置。`login@mail.nextchina.org` 是发件地址；当前 Resend Receiving disabled，并没有为它创建收件邮箱。

### 邮件模板

全部 6 类验证邮件与 7 类安全通知已分别准备，使用中英双语 ChinaTeam 样式。请下载并在浏览器打开 [`supabase/templates/preview.html`](../supabase/templates/preview.html)，逐项复制对应主题和 HTML 正文；不要把 Magic Link 正文重复用在 Confirm signup 或其他不同操作中。

完整文件对应表、SMTP 填写值、批量保存脚本和功能限制见 [邮件配置指南](../supabase/templates/README.md)。七项安全通知建议保存后全部开启；通知开关不会开启网站里的密码、电话或 MFA 功能。

保留验证按钮中的 `{{ .ConfirmationURL }}` 原样，它包含 Supabase 生成的一次性验证链接与返回地址。邮件登录和重新认证模板均使用 `{{ .Token }}`；邮件登录同时保留链接，安全验证页使用 8 位验证码；账户设置已提供密码重置与重新认证输入界面。更换邮件模板本身不需要重新发布网站，但必须在 Supabase 单独保存，提交文件不会自动生效。

依据：[Resend + Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)、[Resend 密钥权限](https://resend.com/docs/dashboard/api-keys/introduction)、[Supabase 邮件模板](https://supabase.com/docs/guides/auth/auth-email-templates)。

## 保存后的验证

1. 打开 `https://www.chinateam.org/en/`，确认地址栏变为 `https://chinateam.org/en/`。
2. 从新站重新进行 Google / GitHub / X 登录，确认回到当前语言首页；已有管理员账号从头像进入管理中心。
3. 在新站输入自己的邮箱，点击发送登录链接。在**发起登录的同一浏览器**打开邮件，确认发件人为 `ChinaTeam <login@mail.nextchina.org>`，返回新站并显示登录状态。不要用另一个浏览器或邮箱内置浏览器打开 PKCE 链接。
4. 邮件问题查 Resend Emails / Logs 与 Supabase Auth Logs。`Error sending confirmation email` 优先检查 SMTP 密钥、发件域和端口；跳回旧域名或 localhost 优先检查 Site URL 与 Redirect URLs；链接失效则重新请求，不复用旧链接。

网站静态构建、匿名访问和模拟邮件提交验证不能替代真实收件与完整授权验证。本次没有自动发送邮件，也没有代替用户完成服务商授权。
