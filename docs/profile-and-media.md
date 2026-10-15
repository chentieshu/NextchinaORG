# 资料、头像与图片

已登录用户从头像菜单打开「个人资料」，编辑显示名、上传/裁剪头像、恢复登录提供商头像或移除头像。支持 JPG、PNG、WebP（原图最大 10 MB），拖动、缩放、旋转和圆形预览；保存为 512 × 512 WebP。现有头像也可以重新裁剪。手动上传或移除后，再次登录不会覆盖用户选择。

Google、GitHub、X 的头像在首次进入网站时由服务端依据 Supabase 返回的身份资料复制到 Cloudflare；获取失败使用首字占位，可在资料中重试。不会把用户社交账号令牌发送给图片来源。

## 单一数据来源

- `omni_profiles.display_name / avatar_key / avatar_source / updated_at` 是资料的唯一有效来源，角色和停用状态仍只允许原有管理流程修改。
- 头像、帖子卡片、正文作者与评论共用 `Avatar / UserIdentity`；列表在同一查询内读取最新资料，正文单次读取作者公开字段，不向浏览器公开他人邮箱或角色。
- 既有文章 `author_name` 暂留用于旧版本兼容；新版列表与正文不以它为当前用户名来源。没有创建第二份用户表，也不使用 Supabase Storage 存放图片。
- `omni_private.media_uploads` 仅是上传配额账本，不存图片。并发配额在数据库加锁校验，50 次 / 50 MiB / 24 小时；限额包含失败预留以防重试绕过。

## Cloudflare

- 私有 R2 桶：`nextchina-media`。
- Worker：`nextchina-media`；域名：`media.teamcn.org`。
- `/v1/profile`：Supabase Bearer 身份验证、账号状态、并发版本校验；替换头像后清理旧对象，保存冲突时回滚新对象。
- `/v1/images`：与头像共享认证及上传限制，供统一富文本编辑器上传配图。客户端去除原图元数据并压缩为最大边 2048 像素 WebP。
- 图片通过不可预测的对象地址公开展示；请不要上传私密文件。R2 桶不开启公开桶域名，只由 Worker 提供图片响应。
- 仅接受位图，限制请求体、检查文件签名；第三方头像仅允许指定 Google、GitHub、X 图片域名，每一次重定向都重新校验。
- 无 `service_role` 或 R2 私钥进入前端/源代码；Worker 通过用户现有令牌和数据库限定接口操作。Cloudflare Rate Limit 为每用户每分钟 20 次，数据库提供跨节点的持久上传配额。

## 检查和发布

`npm run media:check` 生成类型、验证 Worker 并生成 `media-dist/index.js`；`npm test` 同时执行媒体、资料与原有权限测试。构建产物与生成类型不提交。浏览器测试用拦截的上传接口，不会向正式账号或 R2 写入测试头像。

前端保持 GitHub → Cloudflare Pages 的原有自动发布。修改 `workers/media/` 后，使用已授权的 Cloudflare 插件发布经检查的 Worker，或在具备 Cloudflare 凭据的环境运行 `wrangler deploy --config workers/media/wrangler.jsonc`。不要把 Supabase 管理密钥放进 Worker；现有发布所需配置均位于该目录。

资料更新采用 `updated_at` 乐观锁。遇到冲突会保留本地编辑并提供「载入最新资料」，避免刷新或重复请求覆盖较新的修改。上传、登录切换与组件卸载均隔离用户状态。数据库响应中断时，清理前会检查头像是否已经保存成功，避免删除正在使用的头像。

2026-10-13 已应用 `20261013044850_profiles_and_cloudflare_media`，并发布媒体 Worker、私有 R2 桶和 HTTPS 域名。线上验证健康检查 200、未登录上传 401、站点跨域预检 204、非本站预检 403。10 项数据库/媒体测试及 17 项浏览器测试通过；上传与裁剪测试使用受控后端，不修改正式用户的头像。私有配额表不设客户端 RLS 策略是有意拒绝直接访问，只有受控函数可操作。
