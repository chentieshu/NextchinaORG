# 帖子、个人主页与账号设置

这次升级参考 X 的正文优先、附件、公开资料、关注与对话模型，保留本站的长内容、代码块和管理员新闻。支持转发、引用与串文；推荐算法、广告和私信尚未实现。

## 使用

- 论坛帖子直接写正文，不再要求标题或摘要；新闻仍保留标题，且仅管理员可发布。
- 每篇帖子最多四张 Cloudflare 图片。一次多选、粘贴或拖入文件后自动上传，正文可以继续编辑。预览区可向前/后排序、移除、编辑图片说明、裁剪、旋转及缩放；失败的附件保留供重试。图片服务复用 `nextchina-media` 与 R2，接受 JPG、PNG、WebP，每张原图最多 10 MB，浏览器压缩成最长边不超过 2048px 的 WebP。没有新增上传接口或放宽后端四图限制。
- 发帖使用正文优先的布局；常用图片、外链、代码操作在底部，其他格式收进菜单。支持 Ctrl / ⌘ + Enter 发布。图片尚未上传成功或编辑窗口未关闭时，保存、预览与发布暂不可用；已上传的图片随本地/云端草稿恢复。尚未上传的文件只在当前页面内存中，刷新前会提示离开，不能跨刷新恢复本地文件。离线选图先排队，恢复网络后继续上传。新闻保留段落内插图与原来的文章编辑方式。
- 详情与发布前预览使用多图相册，点击图片后可用左右按钮、方向键或横向滑动切换；Esc 关闭并恢复焦点。列表继续显示右侧素材预览。
- 将单独的 YouTube、Bilibili、X、Spotify 或 GitHub 链接粘贴到编辑器会生成内容块；“外部内容”按钮也接受 HTTPS 链接。列表在右侧显示轻量预览，点击进入全文。
- YouTube、Bilibili 和 Spotify 使用官方播放器；X 使用官方 `widgets.js`；GitHub 仓库、Issue、PR、Gist 以安全链接卡片展示。未知 HTTPS 链接也是卡片，不抓取任意网页元数据，不运行 Gist 或用户提交的脚本。
- 第三方内容默认不加载，读者点击后才连接平台。私密、已删除、区域限制或禁止嵌入的内容可能无法播放，始终提供原链接。
- 点击头像/署名进入个人主页。主页展示公开帖子、回复、媒体、简介、网站、加入日期、关注与关注者；论坛顶部的“正在关注”查看关注动态。收藏与草稿仍不公开。
- 设置页修改唯一用户标识、简介、网站、头像和显示名；支持设置/修改密码、恢复密码、修改邮箱、绑定/解绑 Google/GitHub/X、退出其他设备及显示偏好。头像编辑复用既有裁剪套件。
- 回复可继续回复、展开、编辑及删除。删除父回复清除正文，并保留仍有后续讨论的占位；不会删除其他人的后续回复。界面控制缩进，数据库限制最多 32 层以约束异常数据。

## 串文

参照 [X 串文流程](https://help.x.com/en/using-x/create-a-thread)，编辑器提供“添加下一则”、排序、删除和“全部发布”。每则使用同一套富文本与图片编辑器，每则最多四图，一次最多 20 则；正文、附件和上传队列使用稳定标识，排序不打断上传，任何一则存在未完成附件都会阻止整串提交。空白则须补充或移除；本地自动草稿仍保存未完成的文字结构。

新串文“保存草稿”将全部内容原子保存为私密云端草稿，从“我的帖子”可重新编辑。已发布帖子仍单独编辑，作者可从详情点击“续写串文”；续写草稿目前仅保存在当前设备，发布后成为独立帖子。一个串文最多 100 则。所有五种界面语言共用同一帖子草稿，原文不会被界面语言切换翻译或拆分。

首页将串文合并为一个入口，右侧素材布局保持不变；个人主页、搜索、收藏可定位单独的一则。详情按顺序展示，每则有自己的点赞、回复、转发、引用、收藏、分享与管理。删除首帖不会删除其余内容；下架部分内容不会向公开读者泄漏正文。管理员继续使用原有内容管理权限。

迁移 20261014045928_chinateam_post_threads.sql 为 omni_articles 增加串文标识和顺序。整串通过受控 omni_write_post_thread RPC 一次提交，使用行锁、草稿全量版本快照、请求幂等标识和事务回滚；失败不会发布半篇串文。私有请求表只允许函数访问，事务内许可在函数返回前撤销，普通用户不能伪造归属或跳过发帖节流。Cloudflare 的媒体上传接口与 R2 存储继续复用。

## 数据与状态

沿用 `omni_profiles`，增加 `handle / bio / website`。公开资料 RPC 明确选择字段，不返回邮箱、角色或认证数据。唯一用户标识初始从 UUID 生成，可在设置修改。资料保存使用 `updated_at` 比较，发生冲突时保留本地输入。

`omni_follows` 用双列主键去重，禁止自关注，RLS 只允许本人增删自己的关系。关注关系为公开资料的一部分。`omni_comments` 增加父节点、深度及软删除标记；服务端验证同帖父节点、归属、发布状态、不可变身份及节流。管理员仍可管理所有帖子、新闻和评论。

`omni_content_feed` 增加作者、关注与媒体筛选，分页返回正文摘录和最多八个轻量素材描述，不返回完整富文本。帖子、列表和个人主页共用该接口。`ThreadReplies` 替代旧评论组件，每层按 30 条分页；已删除正文不参与评论计数。账号切换、失败重试、分页竞态、重复提交和资料并发冲突均有状态保护。

## Supabase Auth

`supabase/config.toml` 只声明本次管理的属性：手动绑定、12 位最低密码长度、正式站与 Sites 预览各五个精确回调。官方 CLI 只推送明确声明的属性，不重置未声明的现有设置。现有密码策略同时要求大小写字母、数字和符号，界面与其一致。启用安全密码更改时，旧会话需要邮件验证码。

```sh
supabase config diff --project-ref cznhnupwojmydttdattb --output-format json
supabase config push --project-ref cznhnupwojmydttdattb
```

继续使用已配置的 Resend SMTP：`smtp.resend.com:465`，发件地址 `login@mail.nextchina.org`。本次不修改 SMTP 凭据、邮件模板或服务商 OAuth 密钥。恢复密码与身份绑定回调返回设置页；普通登录返回首页。绑定属于当前 Supabase 用户，不创建第二套用户资料。

`signOut({scope:'others'})` 撤销其他会话的刷新令牌；已签发的访问令牌在到期前仍可能有效，界面不会宣称瞬间撤销所有请求。

## 验证及限制

PGlite 实际执行迁移，检查无标题与纯图片发帖、四图上限、跨用户关注权限、公开资料字段、资料乐观锁、父节点约束、三级回复及删除保留上下文。Playwright 使用拦截后端验证富文本、媒体按需加载、关注列表、资料修改、密码校验/重新认证、绑定失败、恢复回调和五语言小屏布局；不会给真实用户发邮件或修改账号。

外部平台的完整 OAuth 授权仍需要真实用户在提供商页面完成。静态导出继续使用客户端读取公开帖子；每帖服务端 SEO、动态社交分享图、全文搜索索引、私信、屏蔽与通知不属于本次实现。

## 调研依据

- [X 发帖](https://help.x.com/en/using-x/how-to-post)、[图片附件](https://help.x.com/en/using-x/posting-gifs-and-pictures)、[个人资料](https://help.x.com/en/managing-your-account/how-to-customize-your-profile)、[对话与回复](https://help.x.com/en/using-x/x-conversations)。
- [YouTube 官方播放器](https://developers.google.com/youtube/iframe_api_reference)、[Bilibili 播放器](https://player.bilibili.com/)、[Spotify 嵌入](https://developer.spotify.com/documentation/embeds/tutorials/creating-an-embed)、[X 嵌入](https://help.x.com/en/using-x/how-to-embed-a-post)。
- [Supabase 身份绑定](https://supabase.com/docs/guides/auth/auth-identity-linking)、[用户更新](https://supabase.com/docs/reference/javascript/auth-updateuser)、[密码恢复](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)、[配置文件](https://supabase.com/docs/guides/local-development/cli/config)。
