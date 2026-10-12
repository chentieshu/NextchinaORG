# NextChina.org · Supabase 邮件模板

更新：2026-10-12。包含截图中的全部 **6 封验证邮件 + 7 封安全通知**。模板为简体中文 / English 双语，使用独立主题、Supabase 原生变量、邮件客户端兼容的表格与内联样式。没有广告、外部字体、图片追踪或依赖图片的按钮。

**当前交付状态：模板文件已准备；尚未写入 Supabase 托管项目，SMTP 是否保存尚未确认。** 发布网站或提交这些文件不会更新 Supabase Auth。当前连接的 Supabase 插件不提供 Auth 邮件配置读写接口。

## 最方便：打开可视化配置页

双击同目录 `preview.html`，在左侧选择与 Supabase 截图相同的项目。右侧能预览成品，并可切换手机宽度。示例邮箱、号码与验证码只用于预览，不会发送。

1. 打开 [Supabase 邮件模板](https://supabase.com/dashboard/project/cznhnupwojmydttdattb/auth/templates)。路径为 Authentication → Notifications → Email → Templates；控制台如跳转，沿菜单进入 Email。
2. 选择对应项目，点击配置页「复制主题」，粘贴到 Subject。
3. 点击「复制 HTML 正文」，粘贴到正文的 HTML / Source 编辑器，替换原有内容，点击 Save。
4. 安全部分的七个项目，保存正文后开启相应开关，再次打开确认已保存。

复制内容包含完整 HTML，可以直接保存。**保留 `{{ ... }}` 原样**。不要把右侧示例预览中的邮箱、代码或链接当成真实模板。剪贴板受浏览器限制时会选中文字，用 Ctrl+C / Command+C 复制即可。

| Supabase 项目 | HTML 文件 | 配置 |
| --- | --- | --- |
| 确认注册 | `confirm-signup.html` | 保存主题和正文 |
| 邀请用户 | `invite-user.html` | 保存；使用前完成邀请回调流程 |
| 魔法链接或一次性密码 | `magic-link.html` | 保存；当前网站使用链接模式 |
| 更改电子邮件地址 | `change-email.html` | 保存；配合邮箱变更功能 |
| 重置密码 | `reset-password.html` | 预备；网站尚无设置新密码页面 |
| 重新认证 | `reauthentication.html` | 预备；网站尚无该验证码输入界面 |
| 密码已更改 | `password-changed.html` | 保存并开启通知 |
| 电子邮件地址已更改 | `email-changed.html` | 保存并开启通知 |
| 电话号码已更改 | `phone-changed.html` | 保存并开启通知 |
| 已链接的登录方式 | `identity-linked.html` | 保存并开启通知 |
| 登录方式已移除 | `identity-unlinked.html` | 保存并开启通知 |
| 新增 MFA 方法 | `mfa-added.html` | 保存并开启通知 |
| MFA 方法已移除 | `mfa-removed.html` | 保存并开启通知 |

每个 HTML 都有同名 `.subject.txt` 主题文件和 `.txt` 纯文本参考。Supabase 控制台保存的是 HTML，纯文本参考无需粘贴为第二封邮件。

## 可选：一次保存全部模板

同目录 `apply.ps1` 通过 Supabase 官方 Management API 保存 13 个主题、13 份 HTML 和 7 个安全通知开关，共 33 项设置。它先备份原有这 33 项设置，保存后重新读取逐项核对；不修改 SMTP、OAuth、跳转地址、用户或数据库，也不会发送测试邮件。

1. 使用 PowerShell 7；此设备的 Codex 已附带 PowerShell 7。进入本文件所在目录。
2. 本地检查（不会联网、不会要求密钥）：

   ```powershell
   pwsh -File .\apply.ps1
   ```

3. 在 [Supabase Access Tokens](https://supabase.com/dashboard/account/tokens) 创建短期 Personal Access Token，尽量限定到本项目，只授予读取和更新 Auth 配置所需权限。它与项目 Publishable / anon key、service_role 和 Resend API key 不同。
4. 运行：

   ```powershell
   pwsh -File .\apply.ps1 -Apply
   ```

5. 脚本提示后，在**本机终端**输入 Token（输入隐藏）。不要把 Token 发到聊天、放进脚本或 GitHub。只有读取、保存、回读一致后才会显示成功。
6. 用完可在 Supabase 撤销该短期 Token。备份位于同目录 `backups/`，已被 Git 忽略，备份仅包含邮件内容与通知开关，不保存 SMTP 密码或 Token。

仅检查远端保存结果：`pwsh -File .\apply.ps1 -VerifyOnly`。若保存请求超时，先检查远端再重试；不要认为报错一定意味着未保存。脚本在令牌失效、字段缺失或回读不一致时会停止并报告。

`auth-email-config.json` 是官方 PATCH 接口请求体，不是 SQL。不能粘贴到 SQL Editor。备份可供管理员在官方 API 或控制台恢复原有邮件字段；不要上传完整 Auth 配置或密钥。

## SMTP：Supabase 生成内容，Resend 负责投递

进入 Email → SMTP Settings，启用 Custom SMTP，填写：

| 字段 | 内容 |
| --- | --- |
| Sender name | `NextChina.org` |
| Sender email | `login@mail.nextchina.org` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | 专用于本项目、限制在 `mail.nextchina.org` 的 Resend Sending API key |

Resend `mail.nextchina.org` 本次检查为 verified / sending enabled；打开和点击跟踪均关闭。SMTP 密码仅在 Supabase 填写，不能放到网站环境中的 `NEXT_PUBLIC_*`。当前 Resend 未启用收信，因此页脚明确引导联系已获授权公开的 `chentieshu520@gmail.com`，没有要求用户回复无人收取的发件地址。

不需要在 Resend Templates 重复创建这些模板；Supabase 会先渲染，然后通过 SMTP 交给 Resend。邮件速率限制由 Supabase Auth Rate Limits 与 Resend 额度共同影响，按实际开放规模设置。

## 已处理的流程区别

- 登录、注册、邀请、邮箱变更、密码重置使用 `{{ .ConfirmationURL }}`。没有手工拼接未实现的 `/auth/confirm` 页面，也不把一次性链接替换成首页。
- 重新认证使用 `{{ .Token }}`。验证码不出现在主题或邮件预览摘要中。
- 更改邮箱确认使用 `{{ .NewEmail }}`；更改完成通知使用 `{{ .OldEmail }}` 和 `{{ .Email }}`，避免混用变量。
- 登录方式与 MFA 通知分别使用 `{{ .Provider }}` 和 `{{ .FactorType }}`。安全通知没有伪造确认链接或验证码。
- 当前网站是 PKCE 魔法链接登录，邮件提醒在发起登录的同一浏览器打开。没有验证码输入框，因此 Magic Link 模板不显示无处可填的验证码。
- 未读取实际有效期，文案不写死「5 分钟」或「1 小时」。真正有效期由 Supabase 设置控制。
- 邀请不会自动赋予管理员；角色继续由数据库权限管理。
- 七项安全通知建议全部开启。没有对应事件时不会发送；这不会开放网站中的密码、手机或 MFA 管理功能。
- 网站仍支持五种语言。这批邮件统一中英双语，不宣称跟随网站语言自动切换；后续可基于明确的用户语言偏好增加多语言邮件选择。

## 保存后的验证

1. 从 `https://nextchina.org/zh-CN/` 发起自己的邮箱登录。在同一浏览器打开新邮件，核对发件人、品牌、按钮和最终登录状态。不要复用已消费的旧链接。
2. 新邮箱注册应使用 Confirm signup，已有邮箱使用 Magic link。真实收件后查看 Resend 邮件日志与 Supabase Auth 日志，确认投递成功。
3. 安全通知只在实际发生对应操作后验证。不要为了测试去移除唯一登录方式、删除 MFA 或修改真实用户账户。
4. 本包没有发送真实邮件，也没有验证 Gmail / Outlook 等真实邮件客户端的完整渲染；本地浏览器预览仅核对布局、文案、变量和链接。
5. 重置密码、邀请、重新认证、电话和 MFA 等未来功能，必须先补齐前端界面与流程测试再对用户开放。保存对应模板不会自动完成这些功能。

维护：修改 `scripts/build-auth-emails.mjs` 后运行 `npm run emails:build`，再重新保存到 Supabase。

依据：[Supabase 邮件模板与 Management API 示例](https://supabase.com/docs/guides/auth/auth-email-templates)、[Supabase PKCE 流程](https://supabase.com/docs/guides/auth/sessions/pkce-flow)、[Resend + Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)。
