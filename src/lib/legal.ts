import type {Locale} from './i18n';
import {c2cLegal} from './c2c-legal';
import {identityLegal} from './identity-legal';
export const supportEmail="chentieshu520@gmail.com";
export const legalUpdated='2026-10-16';
export const googleDataPolicy="https://developers.google.com/terms/api-services-user-data-policy";
type Section={title:string;paragraphs:string[]};
type Document={title:string;intro:string;sections:Section[]};
type LegalCopy={purposeTitle:string;purpose:string;signIn:string;updated:string;contact:string;policyLink:string;revokeLink:string;privacy:Document;terms:Document};
export const legalCopy:Record<Locale,LegalCopy>={
  "zh-CN": {
    "purposeTitle": "Teamcn · 文章与论坛",
    "purpose": "Teamcn 是一个文章与开放论坛社区。任何人都可以直接阅读公开文章和帖子；登录成员可以发帖、点赞、收藏和评论。文章由管理员编辑发布。",
    "signIn": "Google、GitHub、X 或邮箱登录用于建立社区账号、保存收藏和参与讨论。Google 登录仅用于身份验证，不读取 Gmail 邮件、云端硬盘文件、日历或通讯录。",
    "updated": "更新日期",
    "contact": "支持与隐私联系",
    "policyLink": "Google API 服务用户数据政策",
    "revokeLink": "管理 Google 第三方连接",
    "privacy": {
      "title": "隐私政策",
      "intro": "本政策说明 Teamcn 网站运营团队如何处理访问者和注册用户的信息，适用于 pg520.app 与独立管理后台。阅读公开文章与本政策无需登录。",
      "sections": [
        {
          "title": "1. 我们收集哪些信息",
          "paragraphs": [
            "创建账号时，Supabase 身份服务处理你的邮箱、账号标识、邮箱验证状态和登录记录。使用 Google、GitHub 或 X 登录时，它还接收该提供商返回的基本个人资料，例如名称、提供商用户标识及可能包含的头像地址。我们不接收你的社交账号密码。",
            "社区数据库保存显示名称、角色、账号状态、点赞、收藏、评论、相关时间及管理操作记录。公开评论会显示评论内容、显示名称和时间；点赞数量公开，个人收藏不向其他访客公开。请勿在评论中提交敏感资料。",
            "浏览器和基础设施服务商会处理提供网站所需的请求信息，例如 IP 地址、浏览器信息、访问路径和安全日志。",
            " 绑定 X 或 GitHub 后，公开资料和帖子旁会显示验证账号归属的徽章及平台主页链接，解除绑定后移除。我们可从 GitHub 官方 API 缓存本人非 Fork 公开仓库收到的 Star 总和及统计时间，不包括私有或组织仓库。X 粉丝数暂未启用；未来启用时，仅账号本人可请求通过官方 API 同步公开粉丝数。徽章不表示平台官方认证。"
          ]
        },
        {
          "title": "2. Google 登录数据",
          "paragraphs": [
            "选择 Google 登录时，我们通过 Supabase 使用基本身份验证与个人资料权限（email / profile；Google 控制台可能以 openid、userinfo.email、userinfo.profile 显示）。我们使用账号标识和邮箱识别账号，使用名称创建社区显示名称。提供商返回的资料由身份服务保存以支持登录。",
            "本站不请求 Gmail、Google Drive、Calendar 或 Contacts 数据，不代表你发送邮件、修改文件或访问联系人。Google 用户数据不用于广告定向、出售、数据交易或训练通用人工智能模型。我们按照 Google API 服务用户数据政策处理这些数据，并遵守适用的 Limited Use 要求。"
          ]
        },
        {
          "title": "论坛、资料与图片",
          "paragraphs": [
            "我们保存你的显示名、头像对象标识、帖子、富文本、语言版本和编辑时间。用户名与头像显示在公开帖子和评论旁；普通未发布内容供作者与管理员访问；已发布内容的修改另存为仅保存者可见的私密草稿。Google、GitHub 或 X 返回的头像在首次使用时复制至 Cloudflare R2，之后可自行裁剪、更换、移除或恢复。自定义头像不会在再次登录时被覆盖。上传的头像与帖子图片存储在 Cloudflare，通过公开图片地址展示，请勿上传私密材料。浏览器压缩处理上传图片；服务端保留上传大小、归属及时间用于限额与维护。旧头像在替换后清理，浏览器缓存可能暂时保留旧图片。写作草稿先自动保存在当前浏览器，主动保存后同步至 Supabase。删除帖子会移除相关评论、点赞与收藏；已公开图片地址及浏览器缓存不保证同步失效。 个人主页的用户标识、简介、网站、加入时间、公开帖子和回复，以及关注关系和数量对所有访客可见。你可在设置中修改资料和登录方式。删除回复会移除正文，并在仍有后续回复时保留占位以维持上下文。 外部播放器默认在点击后加载，也可以在阅读偏好中选择自动加载。加载 YouTube、Bilibili、X 或 Spotify 内容会连接该平台，可能传送 IP 地址和浏览器信息，并受其 Cookie 政策影响。链接预览元数据通过 Cloudflare 缓存提供；YouTube 与 Spotify 的预览图片由 Cloudflare 代理提供。"
          ]
        },
        {
          "title": "3. 信息的用途",
          "paragraphs": [
            "信息用于创建和维护账号、验证登录、保存你的阅读收藏、处理点赞和评论、执行管理员权限、处理支持请求、防止滥用及维护服务安全。我们不会将 Google 登录资料用于与这些功能无关的目的。"
          ]
        },
        {
          "title": "4. 服务商与信息共享",
          "paragraphs": [
            "Supabase 提供身份验证和数据库；Cloudflare 提供网站托管、内容分发与网络安全。邮件登录配置为通过 Resend 发送时，Resend 会处理收件邮箱、登录邮件内容和投递信息。你选择的 Google、GitHub 或 X 会按自身政策处理授权过程。",
            "仅在提供上述服务、回应你授权的请求、调查安全问题或履行适用法律义务所需范围内处理或披露信息。必要的运维人员可能接触维护与支持所需的信息。我们不出售个人信息，也不向广告平台提供 Google 用户数据。不同服务商可能在你所在地区以外处理数据。"
          ]
        },
        {
          "title": "5. 浏览器存储",
          "paragraphs": [
            "本站使用浏览器本地存储保持登录会话及语言、明暗主题偏好；身份服务可能保存或刷新会话令牌。退出登录会结束当前登录会话，清除浏览器站点数据也会移除本地偏好。当前网站代码没有集成广告追踪或第三方营销分析脚本。基础设施可能使用必要的安全 Cookie。"
          ]
        },
        {
          "title": "6. 保存与删除",
          "paragraphs": [
            "账号与社区数据在账号使用期间保存，以持续提供服务。你可以自行撤回点赞、移除收藏和删除自己的评论。需要访问、更正、导出个人数据或删除账号时，请联系下方邮箱，并提供足以核实账号归属的信息；不要发送密码或登录令牌。",
            "核实请求后，我们会处理相关活跃数据的删除或匿名化；仅在法律要求、争议处理或安全调查所必需的范围内保留资料。备份和服务商日志可能按各自保留周期稍后清除，无法承诺即时从所有备份中抹除。"
          ]
        },
        {
          "title": "7. 撤回 Google 授权",
          "paragraphs": [
            "你可以在 Google 账号的第三方连接页面撤销 Teamcn 的访问。撤销授权不会自动删除已在本站保存的社区数据；如需删除本站账号，请另行联系我们。你仍可不登录阅读公开内容。"
          ]
        },
        {
          "title": "8. 信息安全",
          "paragraphs": [
            "我们使用 HTTPS、数据库访问策略和分级管理权限保护信息。私人收藏和账号数据受到访问限制；公开评论本身会向访客展示。任何网络服务均无法保证绝对安全，发现异常时请通过下方邮箱联系运营团队。"
          ]
        },
        {
          "title": "9. 政策更新与联系",
          "paragraphs": [
            "网站功能或数据处理方式发生变化时，我们会更新本页面日期，并就重要变化提供相应提示；如新增数据用途需要授权，将在使用前取得所需授权。隐私问题、账号删除和支持请求均可发送到下方联系邮箱。"
          ]
        },
        {
          "title": "账号设置与显示偏好",
          "paragraphs": [
            "我们保存你选择的唯一用户名、资料完成时间、界面语言和主题偏好。账号偏好在登录时应用，访客偏好保存在当前浏览器。帖子只展示作者原文；文章可以具有管理员维护的不同语言版本。统一搜索仅索引公开内容，不展示草稿、私人收藏或账号偏好。",
            "我们保存文章语言、外部媒体加载方式和是否显示转发等阅读偏好。转发关系和已发布引用是公开内容；撤销转发不删除原帖。引用原帖被下架或删除后不再展示其正文。敏感操作使用邮箱验证码。Supabase 验证代码并保存认证记录，Resend 负责发送邮件；网站不保存你输入的验证码。"
          ]
        }
      ]
    },
    "terms": {
      "title": "使用条款",
      "intro": "Teamcn 是科技文章与讨论网站。使用互动功能时，请遵守以下规则。",
      "sections": [
        {
          "title": "1. 服务与账号",
          "paragraphs": [
            "公开文章、帖子与政策无需登录即可阅读。已登录且未停用的成员可以发表帖子、管理自己的帖子、点赞、收藏和评论；文章由管理员发布。管理员可以编辑、置顶、锁定、下架或删除帖子、文章和评论。请保护你的账户，不要冒充他人。"
          ]
        },
        {
          "title": "2. 内容与讨论规则",
          "paragraphs": [
            "请尊重他人、注明引用来源，对自己发布的内容负责。不得发布骚扰、垃圾信息、侵权、诈骗、泄露个人隐私或其他违法内容。禁止制作、分享或传播未经同意的私密影像（包括人工智能生成的内容）。管理员可以处理违规评论、限制互动或停用违规账号。"
          ]
        },
        {
          "title": "3. 科技报道与人工智能",
          "paragraphs": [
            "本站报道科技和人工智能相关文章，不提供图像、视频或私密影像生成服务。Google 登录只用于社区身份验证，不用于生成内容，也不将 Google 用户数据用于通用人工智能模型训练。"
          ]
        },
        {
          "title": "4. 来源与权利",
          "paragraphs": [
            "你保留自己帖子和评论的权利，并允许本站为提供社区服务而存储、展示和管理这些内容。尊重他人的著作权、来源和隐私，不要上传或链接无权分享的材料。文章和讨论仅供信息交流，不构成专业建议。"
          ]
        },
        {
          "title": "5. 服务变更与联系",
          "paragraphs": [
            "我们可能维护、调整或暂停部分功能，并在适当情况下提供通知。你可以停止使用服务并请求删除账号。涉及隐私、使用规则或支持的问题，请通过下方邮箱联系运营团队。"
          ]
        }
      ]
    }
  },
  "en": {
    "purposeTitle": "Teamcn · Articles and forum",
    "purpose": "Teamcn is an open articles and forum community. Anyone can read public articles and posts. Signed-in members can publish posts, like, bookmark and comment. Administrators edit and publish articles.",
    "signIn": "Sign in with Google, GitHub, X or email to create a community account, save bookmarks and join discussions. Google is used only for authentication; we do not access Gmail, Drive, Calendar or Contacts.",
    "updated": "Last updated",
    "contact": "Support and privacy contact",
    "policyLink": "Google API Services User Data Policy",
    "revokeLink": "Manage Google third-party connections",
    "privacy": {
      "title": "Privacy Policy",
      "intro": "This policy explains how the Teamcn website operators handle visitor and member information on pg520.app and its separate administration site. Public articles and this policy are available without signing in.",
      "sections": [
        {
          "title": "1. Information we collect",
          "paragraphs": [
            "Supabase Auth processes your email address, account identifier, email verification status and login records. With Google, GitHub or X sign-in, it also receives basic profile information returned by that provider, such as your name, provider user identifier and, when supplied, avatar URL. We do not receive your social account password.",
            "Our community database stores your display name, role, account status, likes, bookmarks, comments, associated timestamps and administrative action records. Comments display their text, display name and date publicly. Like counts are public; personal bookmarks are not exposed to other visitors. Do not post sensitive information in comments.",
            "Your browser and our infrastructure providers process request information necessary to serve the website, such as IP addresses, browser information, requested paths and security logs.",
            " Linked X and GitHub accounts display public ownership badges and profile links, removed when unlinked. We cache the total Stars received by your public, non-fork GitHub repositories and the collection time via GitHub’s official API, excluding private and organization repositories. X follower counts are currently disabled; if enabled later, only the owner can request a public follower-count sync through the official API. These badges do not represent platform verification."
          ]
        },
        {
          "title": "2. Google user data",
          "paragraphs": [
            "Google sign-in uses Supabase and basic identity/profile permissions (email / profile, which Google settings may list as openid, userinfo.email and userinfo.profile). Account identifiers and email identify your account; your name is used to create a community display name. Profile information returned by Google is retained by the identity service to support sign-in.",
            "We do not request Gmail messages, Drive files, Calendar events or Contacts. We do not send messages or modify Google resources on your behalf. Google user data is not sold, used for targeted advertising, traded or used to train general-purpose AI models. We handle it according to the Google API Services User Data Policy, including applicable Limited Use requirements."
          ]
        },
        {
          "title": "Forum, profiles and images",
          "paragraphs": [
            "We store your display name, avatar object identifier, posts, rich text, translations and edit times. Names and photos appear beside public posts and comments; unpublished content is accessible to its author and administrators; edits to published content are stored separately as private drafts visible only to the person saving them. On first use, a photo supplied by Google, GitHub or X is copied to Cloudflare R2. You can crop, replace, remove or restore it; later sign-ins do not overwrite your custom choice. Uploaded avatars and post images are stored in Cloudflare and served at public image URLs. Do not upload private material. The browser processes uploaded images; we retain upload size, ownership and time for quotas and maintenance. Replaced avatars are cleaned up, though browser caches may retain earlier images. Writing drafts autosave in this browser and sync to Supabase when explicitly saved. Deleting a post removes its comments, likes and bookmarks; public image URLs and cached copies may remain accessible. Your public profile includes your handle, bio, website, join date, public posts and replies, and follow relationships and counts. Settings let you edit your profile and sign-in methods. External players load on click by default, or automatically if you choose that reading preference. Loading YouTube, Bilibili, X or Spotify connects to that platform, which may receive your IP address and browser information and apply its cookie policy. Link preview metadata is cached through Cloudflare; YouTube and Spotify preview images are served through a Cloudflare proxy. Deleting a reply removes its content and preserves a placeholder when later replies need the context."
          ]
        },
        {
          "title": "3. Why we use information",
          "paragraphs": [
            "We use information to create and maintain accounts, authenticate users, save bookmarks, process likes and comments, enforce administrator permissions, respond to support requests, prevent abuse and maintain security. Google sign-in information is not used for unrelated purposes."
          ]
        },
        {
          "title": "4. Providers and sharing",
          "paragraphs": [
            "Supabase provides authentication and database services. Cloudflare provides hosting, content delivery and network security. When email sign-in is configured to use Resend, Resend processes recipient addresses, sign-in email content and delivery information. Your chosen Google, GitHub or X provider handles authorization under its own policies.",
            "Information is processed or disclosed only as needed to provide these services, respond to requests you authorize, investigate security issues or meet applicable legal obligations. Operational personnel may access information necessary for maintenance or support. We do not sell personal information or supply Google user data to advertising platforms. Providers may process data outside your country."
          ]
        },
        {
          "title": "5. Browser storage",
          "paragraphs": [
            "Local browser storage maintains your session, language and theme preferences. The identity service may store or refresh session tokens. Signing out ends the current session; clearing site data removes local preferences. The current website code does not integrate advertising trackers or third-party marketing analytics. Infrastructure may use necessary security cookies."
          ]
        },
        {
          "title": "6. Retention and deletion",
          "paragraphs": [
            "Account and community data is kept while your account is in use to provide the service. You can remove your likes, bookmarks and comments. To request access, correction, export or account deletion, contact the address below with enough information to verify account ownership. Do not send passwords or sign-in tokens.",
            "After verifying a request, we handle deletion or anonymization of relevant active data. Information may be retained only as needed for legal obligations, disputes or security investigations. Backups and provider logs may expire later under their retention cycles; immediate removal from every backup is not guaranteed."
          ]
        },
        {
          "title": "7. Revoking Google access",
          "paragraphs": [
            "You can revoke Teamcn access in your Google account’s third-party connections. Revocation does not automatically delete community data already stored by this website. Contact us separately to delete your website account. Public content remains readable without signing in."
          ]
        },
        {
          "title": "8. Security",
          "paragraphs": [
            "We use HTTPS, database access policies and role-based administration. Private bookmarks and account data have access restrictions; public comments are visible to visitors. No online service can guarantee absolute security. Report suspected issues to the contact below."
          ]
        },
        {
          "title": "9. Updates and contact",
          "paragraphs": [
            "We update this page and its date when features or data practices change, provide appropriate notice of significant changes and obtain required authorization before introducing new data uses. Send privacy questions, deletion requests and support inquiries to the contact below."
          ]
        },
        {
          "title": "Account setup and display preferences",
          "paragraphs": [
            "We store your chosen unique username, profile completion time, display language and theme preference. Account preferences apply when you sign in; guest preferences stay in the current browser. Posts display their original text, while articles may have translations maintained by administrators. Public search covers public content and does not expose drafts, private bookmarks or account preferences.",
            "We store reading preferences for articles language, external media and repost visibility. Repost relationships and published quotes are public; undoing a repost does not delete the original. When an original is unpublished or deleted, its text is no longer shown in quote cards. Sensitive actions use email verification codes. Supabase verifies codes and keeps authentication records; Resend delivers the email. The website does not store the codes you enter."
          ]
        }
      ]
    },
    "terms": {
      "title": "Terms of Service",
      "intro": "Teamcn is a technology articles and discussion website. These rules apply when using its community features.",
      "sections": [
        {
          "title": "1. Service and accounts",
          "paragraphs": [
            "Public articles, posts and policies can be read without signing in. Active signed-in members can publish and manage their own posts, like, bookmark and comment. Administrators publish articles and may edit, pin, lock, unpublish or delete posts, articles and comments. Protect your account and do not impersonate others."
          ]
        },
        {
          "title": "2. Community content",
          "paragraphs": [
            "Respect others, credit sources and take responsibility for your contributions. Harassment, spam, infringement, fraud, privacy violations and unlawful content are prohibited. Creating, sharing or distributing non-consensual intimate imagery, including AI-generated imagery, is prohibited. Administrators may moderate comments, restrict interactions or disable accounts that violate these rules."
          ]
        },
        {
          "title": "3. Technology reporting and AI",
          "paragraphs": [
            "This website reports on technology and AI. It does not provide image, video or intimate imagery generation services. Google sign-in is used only to authenticate community accounts, not to generate content or train general-purpose AI models using Google user data."
          ]
        },
        {
          "title": "4. Sources and rights",
          "paragraphs": [
            "You retain rights to your posts and comments and permit us to store, display and moderate them to provide the community service. Respect copyright, sources and privacy; do not share materials without permission. Articles and discussions provide information, not professional advice."
          ]
        },
        {
          "title": "5. Changes and contact",
          "paragraphs": [
            "We may maintain, change or suspend features and provide notice where appropriate. You may stop using the service and request account deletion. Contact the website operators below for privacy, community rules or support questions."
          ]
        }
      ]
    }
  },
  "zh-TW": {
    "purposeTitle": "Teamcn · 文章與論壇",
    "purpose": "Teamcn 是文章與開放論壇社群。任何人都能閱讀公開文章和貼文；登入成員可發文、按讚、收藏和留言。文章由管理員編輯發布。",
    "signIn": "使用 Google、GitHub、X 或電子郵件建立社群帳號、儲存收藏並參與討論。Google 僅用於身分驗證，不讀取 Gmail、雲端硬碟、日曆或聯絡人。",
    "updated": "更新日期",
    "contact": "支援與隱私聯絡",
    "policyLink": "Google API 服務使用者資料政策",
    "revokeLink": "管理 Google 第三方連結",
    "privacy": {
      "title": "隱私政策",
      "intro": "本政策說明 Teamcn 網站營運團隊如何處理 pg520.app 與獨立管理後台的訪客與會員資料。公開文章和本政策無需登入即可閱讀。",
      "sections": [
        {
          "title": "1. 收集的資料",
          "paragraphs": [
            "Supabase 身分服務處理電子郵件、帳號識別碼、信箱驗證狀態及登入紀錄。透過 Google、GitHub 或 X 登入時，亦會接收服務商傳回的基本資料，例如姓名、服務商使用者識別碼及可能提供的頭像網址。我們不接收社群帳號密碼。",
            "社群資料庫保存顯示名稱、角色、帳號狀態、按讚、收藏、留言、相關時間和管理操作紀錄。留言內容、名稱與日期及按讚數量公開；個人收藏不向其他訪客公開。請勿在留言中提交敏感資料。基礎設施服務商會處理 IP 位址、瀏覽器資訊、請求路徑及安全紀錄等必要資訊。",
            " 綁定 X 或 GitHub 後，公開資料和貼文旁會顯示驗證帳號歸屬的徽章及平台主頁連結，解除綁定後移除。我們可從 GitHub 官方 API 快取本人非 Fork 公開儲存庫收到的 Star 總和及統計時間，不含私有或組織儲存庫。X 粉絲數暫未啟用；未來啟用時，僅本人可要求透過官方 API 同步公開粉絲數。徽章不表示平台官方認證。"
          ]
        },
        {
          "title": "2. Google 資料及用途",
          "paragraphs": [
            "Google 登入透過 Supabase 使用基本身分及個人資料權限（email / profile；Google 設定可能顯示 openid、userinfo.email、userinfo.profile）。識別碼與電子郵件用於辨識帳號，姓名用於建立顯示名稱，服務商傳回的資料由身分服務保存以支援登入。",
            "我們不請求 Gmail、Drive、Calendar 或 Contacts 資料，也不代你寄信或修改 Google 資源。Google 資料不會出售、交易、用於廣告定向或訓練通用人工智慧模型。我們依照 Google API 服務使用者資料政策及適用的 Limited Use 要求處理資料。"
          ]
        },
        {
          "title": "論壇、資料與圖片",
          "paragraphs": [
            "我們儲存顯示名稱、頭像物件識別碼、貼文、富文本、語言版本與編輯時間。名稱及頭像顯示於公開貼文與留言旁；一般未發佈內容由作者與管理員存取；已發佈內容的修改另存為僅儲存者可見的私人草稿。Google、GitHub 或 X 的頭像在首次使用時複製至 Cloudflare R2，之後可裁切、更換、移除或恢復；再次登入不會覆蓋自訂選擇。上傳圖片儲存於 Cloudflare 並透過公開網址展示，請勿上傳私密資料。瀏覽器會處理圖片，系統記錄大小、歸屬與時間以管理配額及維護。更換後清理舊頭像，但瀏覽器快取可能暫時保留。草稿先自動儲存在本機，主動儲存後同步到 Supabase。刪除貼文會移除留言、按讚與收藏，已公開圖片網址及快取不保證同步失效。 個人主頁的使用者代號、簡介、網站、加入時間、公開貼文和回覆，以及追蹤關係和數量對訪客公開。可於設定修改資料及登入方式。外部播放器預設在點擊後載入，也可在閱讀偏好選擇自動載入。載入 YouTube、Bilibili、X 或 Spotify 會連線至該平台，可能傳送 IP 位址與瀏覽器資訊，並適用其 Cookie 政策。連結預覽資料透過 Cloudflare 快取提供；YouTube 與 Spotify 預覽圖片由 Cloudflare 代理提供。 刪除回覆會移除內文，若有後續回覆則保留佔位以維持上下文。"
          ]
        },
        {
          "title": "3. 使用目的",
          "paragraphs": [
            "資料用於維護帳號、驗證登入、儲存收藏、處理按讚與留言、執行管理權限、回應支援請求、防止濫用及維護安全，不將 Google 登入資料用於無關目的。"
          ]
        },
        {
          "title": "4. 服務商與分享",
          "paragraphs": [
            "Supabase 提供驗證與資料庫，Cloudflare 提供託管、內容傳遞及網路安全；郵件登入設定為透過 Resend 寄送時，Resend 處理收件地址、登入郵件內容及投遞資訊。你選擇的登入服務商另依自身政策處理授權。",
            "我們僅在提供服務、處理你授權的請求、安全調查或法律義務所需範圍處理或披露資料；必要維運人員可能存取維護與支援所需資訊。我們不出售個人資料，也不向廣告平台提供 Google 資料。服務商可能於你所在地區以外處理資料。"
          ]
        },
        {
          "title": "5. 瀏覽器儲存",
          "paragraphs": [
            "本機儲存用於登入工作階段、語言及明暗主題偏好；身分服務可能保存或更新工作階段權杖。登出會結束目前工作階段，清除網站資料也會移除本機偏好。目前網站程式碼沒有整合廣告追蹤或第三方行銷分析；基礎設施可能使用必要安全 Cookie。"
          ]
        },
        {
          "title": "6. 保存與刪除",
          "paragraphs": [
            "帳號使用期間保存所需資料。你可自行取消按讚、移除收藏及刪除自己的留言。如需存取、更正、匯出資料或刪除帳號，請聯絡下方信箱並提供核實帳號歸屬所需資訊，切勿寄送密碼或登入權杖。",
            "核實後會處理相關活躍資料的刪除或匿名化；法律、爭議或安全調查所需資訊可能保留。備份與服務商紀錄可能依各自週期稍後清除，不保證即時從所有備份移除。"
          ]
        },
        {
          "title": "7. 撤回授權與安全",
          "paragraphs": [
            "你可在 Google 帳號的第三方連結頁面撤回授權；這不會自動刪除本站已保存的社群資料，刪除帳號請另行聯絡。我們採用 HTTPS、資料庫存取政策及分級權限，但無法保證絕對安全；請向下方信箱回報異常。"
          ]
        },
        {
          "title": "8. 更新與聯絡",
          "paragraphs": [
            "功能或資料處理方式改變時，我們會更新本頁日期並就重要變更提供適當通知，新增用途需要授權時會事先取得。隱私、刪除與支援請求均可寄至下方信箱。"
          ]
        },
        {
          "title": "帳號設定與顯示偏好",
          "paragraphs": [
            "我們儲存你選擇的唯一使用者名稱、資料完成時間、介面語言及主題偏好。帳號偏好在登入時套用，訪客偏好儲存在目前瀏覽器。貼文只顯示作者原文，文章可有管理員維護的不同語言版本。公開搜尋不顯示草稿、私人收藏或帳號偏好。",
            "我們儲存文章語言、外部媒體載入方式及是否顯示轉發等閱讀偏好。轉發關係與已發佈引用為公開內容；取消轉發不會刪除原文。原文下架或刪除後不再顯示其內容。敏感操作使用信箱驗證碼。Supabase 驗證代碼並儲存認證紀錄，Resend 負責傳送郵件；網站不儲存你輸入的驗證碼。"
          ]
        }
      ]
    },
    "terms": {
      "title": "使用條款",
      "intro": "Teamcn 為科技文章與討論網站，使用社群功能請遵守下列規則。",
      "sections": [
        {
          "title": "1. 服務與帳號",
          "paragraphs": [
            "公開文章、貼文與政策無須登入即可閱讀。未停用的登入成員可發表及管理自己的貼文、按讚、收藏和留言；文章由管理員發布。管理員可以編輯、置頂、鎖定、下架或刪除貼文、文章和留言。請保護帳戶，不要冒充他人。"
          ]
        },
        {
          "title": "2. 內容規範",
          "paragraphs": [
            "尊重他人、註明來源並對自己的內容負責。禁止騷擾、垃圾訊息、侵權、詐騙、洩露隱私及違法內容；禁止製作或傳播未經同意的私密影像，包括人工智慧生成內容。管理員可移除違規留言、限制互動或停用帳號。"
          ]
        },
        {
          "title": "3. 科技與人工智慧",
          "paragraphs": [
            "本站報導科技與人工智慧文章，不提供圖像、影片或私密影像生成服務。Google 登入僅供身分驗證，不用於內容生成，也不將 Google 資料用於通用人工智慧模型訓練。"
          ]
        },
        {
          "title": "4. 權利與聯絡",
          "paragraphs": [
            "你保留自己貼文與留言的權利，並允許本站為提供服務而儲存、顯示和管理內容。尊重著作權、來源與隱私，不要分享無權使用的素材。文章和討論僅供資訊交流，不構成專業建議。"
          ]
        }
      ]
    }
  },
  "ja": {
    "purposeTitle": "Teamcn · 記事とフォーラム",
    "purpose": "Teamcn は記事と公開フォーラムのコミュニティです。公開記事と投稿は誰でも閲覧できます。ログインしたメンバーは投稿、いいね、保存、コメントを利用でき、管理者が記事を編集・公開します。",
    "signIn": "Google、GitHub、X、メールでコミュニティに参加できます。Google は本人認証のためだけに使用し、Gmail、Drive、Calendar、Contacts にはアクセスしません。",
    "updated": "更新日",
    "contact": "サポート・プライバシー窓口",
    "policyLink": "Google API サービスのユーザーデータに関するポリシー",
    "revokeLink": "Google のサードパーティ接続を管理",
    "privacy": {
      "title": "プライバシーポリシー",
      "intro": "Teamcn 運営チームによる pg520.app および管理サイトの利用者情報の取り扱いを説明します。公開記事と本ポリシーはログイン不要です。",
      "sections": [
        {
          "title": "1. 収集する情報",
          "paragraphs": [
            "Supabase Auth はメールアドレス、アカウント識別子、メール確認状態、ログイン記録を処理します。Google、GitHub、X でログインすると、氏名、プロバイダーのユーザー識別子、提供される場合はアバター URL などの基本情報も受信します。外部アカウントのパスワードは受信しません。",
            "コミュニティには表示名、権限、アカウント状態、いいね、ブックマーク、コメント、日時、管理操作記録が保存されます。コメントの内容・表示名・日時といいね数は公開されます。個人のブックマークは他の訪問者には公開されません。インフラ事業者は IP アドレス、ブラウザー情報、要求パス、安全性ログなども処理します。",
            " X・GitHub を連携すると所有確認バッジとプロフィールリンクを公開し、解除すると非表示になります。GitHub 公式 API から、本人所有の公開かつ非フォークのリポジトリの Star 合計と集計時刻をキャッシュします。非公開・組織リポジトリは含みません。X フォロワー数は現在無効です。将来有効にした場合は本人のみが公式 API による同期を要求できます。バッジはプラットフォームの公式認証ではありません。"
          ]
        },
        {
          "title": "2. Google データ",
          "paragraphs": [
            "Google ログインは Supabase を通じて基本認証とプロフィール権限（email / profile。設定上は openid、userinfo.email、userinfo.profile と表示される場合があります）を使用します。識別子とメールでアカウントを認識し、氏名から表示名を作成します。返されたプロフィールは認証サービスに保存されます。",
            "Gmail、Drive、Calendar、Contacts のデータは要求せず、本人に代わって送信やリソース変更を行いません。Google データの販売、取引、広告ターゲティング、汎用 AI モデルの学習への使用は行いません。Google のユーザーデータポリシーおよび適用される Limited Use 要件に従います。"
          ]
        },
        {
          "title": "投稿・プロフィール・画像",
          "paragraphs": [
            "表示名、アバターの識別子、投稿、リッチテキスト、翻訳、編集日時を保存します。名前と写真は公開投稿とコメントに表示され、未公開コンテンツは作者と管理者が閲覧できます。公開済みコンテンツの変更は別の非公開下書きに保存され、保存した本人のみが閲覧できます。Google・GitHub・X の写真は初回利用時に Cloudflare R2 へコピーされ、切り抜き・変更・削除・復元ができます。再ログイン時に手動設定を上書きしません。アップロード画像は Cloudflare に保存され公開URLで配信されるため、私的な資料をアップロードしないでください。画像はブラウザで処理し、容量・所有者・日時を制限と保守のために記録します。交換前の写真は削除されますがキャッシュに残る場合があります。下書きはブラウザに自動保存され、保存操作後に Supabase に同期します。投稿削除後も画像URLやキャッシュが残る場合があります。 ユーザー名、自己紹介、ウェブサイト、登録日、公開投稿と返信、フォロー関係と件数は公開されます。設定でプロフィールとログイン方法を変更できます。返信を削除すると本文を除去し、後続の返信がある場合は文脈を保つため表示枠を残します。 外部プレーヤーは初期設定ではクリック後に読み込みます。閲覧設定で自動読み込みも選べます。YouTube、Bilibili、X、Spotify の読み込み時は各サービスに接続し、IP アドレスやブラウザー情報が送られ、各社の Cookie ポリシーが適用される場合があります。リンク情報は Cloudflare 経由でキャッシュし、YouTube と Spotify のプレビュー画像も Cloudflare 経由で配信します。"
          ]
        },
        {
          "title": "3. 利用目的",
          "paragraphs": [
            "情報はアカウント管理、認証、ブックマーク保存、いいね・コメント処理、管理権限、サポート、不正利用防止、安全性維持に使用し、Google ログイン情報を無関係な目的に使用しません。"
          ]
        },
        {
          "title": "4. 事業者と共有",
          "paragraphs": [
            "Supabase は認証とデータベース、Cloudflare はホスティング・配信・セキュリティを提供します。Resend 経由のメールログインを設定した場合、Resend は宛先、ログインメール内容、配信情報を処理します。選択したログイン事業者は独自のポリシーで認可を処理します。",
            "サービス提供、利用者が認めた依頼、安全性調査、法的義務に必要な範囲でのみ処理・開示します。保守やサポートに必要な情報を運営担当者が閲覧する場合があります。個人情報を販売したり、Google データを広告事業者へ提供したりしません。国外で処理される場合があります。"
          ]
        },
        {
          "title": "5. ブラウザー内の保存",
          "paragraphs": [
            "ローカルストレージにセッション、言語、テーマを保存し、認証サービスがセッショントークンを保持・更新する場合があります。ログアウトで現在のセッションを終了し、サイトデータの消去で設定を削除できます。現在のサイトコードに広告追跡や外部マーケティング解析はありません。インフラが必要なセキュリティ Cookie を使用する場合があります。"
          ]
        },
        {
          "title": "6. 保持と削除",
          "paragraphs": [
            "アカウント利用中はサービスに必要な情報を保持します。いいね、ブックマーク、自分のコメントは削除できます。情報の開示・訂正・エクスポートやアカウント削除は下記窓口へ依頼してください。本人確認に必要な情報をお知らせいただき、パスワードやログイントークンは送らないでください。",
            "確認後、対象となる稼働中のデータを削除または匿名化します。法令、紛争、安全性調査に必要な情報は保持する場合があります。バックアップや事業者ログの削除時期は保持サイクルによるため、すべての複製の即時削除は保証しません。"
          ]
        },
        {
          "title": "7. 許可の撤回と安全性",
          "paragraphs": [
            "Google アカウントのサードパーティ接続から許可を取り消せますが、当サイトに保存済みのデータは自動削除されません。削除は別途ご依頼ください。HTTPS、データベースアクセス制御、役割別管理を使用していますが、絶対的な安全は保証できません。不審な問題は下記へご連絡ください。"
          ]
        },
        {
          "title": "8. 変更とお問い合わせ",
          "paragraphs": [
            "機能や取り扱い変更時は更新日を変更し、重要な変更は適切にお知らせします。新たな利用に認可が必要な場合は事前に取得します。プライバシー、削除、サポートに関するご依頼は下記メールへお送りください。"
          ]
        },
        {
          "title": "アカウント設定と表示設定",
          "paragraphs": [
            "選択した一意のユーザー名、プロフィール設定完了日時、表示言語、テーマを保存します。ログイン時にアカウント設定を適用し、ゲストの設定は現在のブラウザーに保存します。投稿は原文を表示し、記事は管理者が翻訳を用意できます。検索では公開内容のみを表示し、下書き、非公開の保存一覧、アカウント設定は公開しません。",
            "記事の言語、外部メディア、リポスト表示の設定を保存します。リポストと公開済み引用は公開情報です。リポストの取り消しでは原文は削除されません。原文が非公開化または削除されると引用カードに本文を表示しません。重要な操作にはメール確認コードを使用します。Supabase が検証と認証記録を管理し、Resend がメールを配信します。サイトは入力されたコードを保存しません。"
          ]
        }
      ]
    },
    "terms": {
      "title": "利用規約",
      "intro": "Teamcn はテクノロジー記事と議論のサイトです。コミュニティ機能には以下のルールが適用されます。",
      "sections": [
        {
          "title": "1. サービスとアカウント",
          "paragraphs": [
            "公開記事、投稿、ポリシーはログインせずに閲覧できます。有効なアカウントのメンバーは自分の投稿を公開・管理し、いいね、保存、コメントができます。管理者は記事を公開し、投稿・記事・コメントを編集、固定、ロック、非公開化、削除できます。アカウントを保護し、なりすましをしないでください。"
          ]
        },
        {
          "title": "2. 投稿ルール",
          "paragraphs": [
            "他者と出典を尊重し、自分の投稿に責任を持ってください。嫌がらせ、スパム、権利侵害、詐欺、プライバシー侵害、違法内容は禁止です。同意のない私的・性的な画像の制作や配布は AI 生成を含め禁止します。管理者は違反コメントの削除、機能制限、アカウント停止を行う場合があります。"
          ]
        },
        {
          "title": "3. テクノロジーと AI",
          "paragraphs": [
            "当サイトは技術と AI を報道し、画像・動画・私的画像の生成サービスは提供しません。Google ログインは認証専用で、生成や Google データによる汎用 AI 学習には使用しません。"
          ]
        },
        {
          "title": "4. 権利とお問い合わせ",
          "paragraphs": [
            "自分の投稿とコメントの権利を保持し、サービス提供に必要な保存、表示、管理を許可します。他者の著作権、出典、プライバシーを尊重し、共有権限のない素材を使用しないでください。記事と議論は情報提供であり、専門的助言ではありません。"
          ]
        }
      ]
    }
  },
  "es": {
    "purposeTitle": "Teamcn · Artículos y foro",
    "purpose": "Teamcn es una comunidad abierta de artículos y foro. Cualquier persona puede leer artículos y publicaciones públicas. Los miembros pueden publicar, dar me gusta, guardar y comentar; la administración edita y publica artículos.",
    "signIn": "Accede con Google, GitHub, X o correo para crear tu cuenta, guardar artículos y participar. Google se usa solo para autenticarte; no accedemos a Gmail, Drive, Calendar ni Contacts.",
    "updated": "Última actualización",
    "contact": "Contacto de soporte y privacidad",
    "policyLink": "Política de Datos de Usuario de los Servicios de API de Google",
    "revokeLink": "Gestionar conexiones de terceros de Google",
    "privacy": {
      "title": "Política de privacidad",
      "intro": "Esta política explica cómo el equipo de Teamcn trata la información de visitantes y miembros en pg520.app y su sitio de administración. Los artículos públicas y esta política no requieren iniciar sesión.",
      "sections": [
        {
          "title": "1. Información recopilada",
          "paragraphs": [
            "Supabase Auth procesa el correo, identificador de cuenta, estado de verificación y registros de acceso. Al acceder con Google, GitHub o X también recibe datos básicos que el proveedor devuelve, como nombre, identificador del proveedor y, si se facilita, URL del avatar. No recibimos tu contraseña de esas cuentas.",
            "La base comunitaria guarda nombre visible, rol, estado, me gusta, favoritos, comentarios, fechas y registros administrativos. El texto, nombre y fecha de los comentarios y los recuentos de me gusta son públicos. Los favoritos personales no se muestran a otros visitantes. La infraestructura procesa datos necesarios como IP, navegador, rutas solicitadas y registros de seguridad."
          ]
        },
        {
          "title": "2. Datos de Google",
          "paragraphs": [
            "El acceso con Google usa Supabase y permisos básicos de identidad y perfil (email / profile, que pueden aparecer como openid, userinfo.email y userinfo.profile). El identificador y correo identifican la cuenta; el nombre crea el nombre visible. El servicio de identidad conserva el perfil recibido para permitir el acceso.",
            "No solicitamos mensajes de Gmail, archivos de Drive, eventos de Calendar ni Contacts, ni enviamos mensajes o modificamos recursos de Google en tu nombre. No vendemos ni comercializamos estos datos, ni los usamos para publicidad dirigida o entrenar modelos de IA de uso general. Los tratamos conforme a la política de Google y los requisitos aplicables de Limited Use.",
            " Las cuentas X y GitHub vinculadas muestran insignias públicas de titularidad y enlaces; se eliminan al desvincularlas. Guardamos en caché las Stars recibidas por tus repositorios públicos propios sin forks, junto con la fecha, mediante la API oficial de GitHub. Excluimos repositorios privados y de organizaciones. El recuento de seguidores de X está desactivado; si se habilita, solo el titular podrá solicitar una sincronización mediante la API oficial. Las insignias no representan verificación oficial de las plataformas."
          ]
        },
        {
          "title": "Foro, perfiles e imágenes",
          "paragraphs": [
            "Guardamos tu nombre visible, identificador de avatar, publicaciones, texto enriquecido, traducciones y fechas de edición. El nombre y la foto aparecen junto a publicaciones y comentarios. El contenido sin publicar es accesible para su autor y administradores; los cambios de contenido publicado se guardan por separado como borradores privados visibles solo para quien los guarda. La foto de Google, GitHub o X se copia a Cloudflare R2 en el primer uso y puede recortarse, cambiarse, quitarse o restaurarse. Los accesos posteriores no reemplazan tu elección. Las imágenes subidas se almacenan en Cloudflare y se sirven mediante URL públicas; no subas material privado. El navegador procesa las imágenes y guardamos tamaño, propietario y fecha para límites y mantenimiento. Las fotos sustituidas se eliminan, pero pueden quedar en cachés. Los borradores se guardan localmente y se sincronizan con Supabase al guardarlos. Eliminar una publicación borra sus comentarios, favoritos y me gusta; sus URL de imágenes y copias en caché pueden seguir accesibles. El usuario, biografía, sitio web, fecha de registro, publicaciones y respuestas públicas, relaciones y recuentos de seguimiento son públicos. Los ajustes permiten editar el perfil y métodos de acceso. Los reproductores externos se cargan al hacer clic por defecto, o automáticamente si eliges esa preferencia. Cargar YouTube, Bilibili, X o Spotify conecta con la plataforma, que puede recibir tu IP e información del navegador y aplicar su política de cookies. Los metadatos se almacenan en caché mediante Cloudflare; las imágenes de vista previa de YouTube y Spotify también se sirven mediante un proxy de Cloudflare. Al eliminar una respuesta se quita su contenido y se conserva un marcador si hay respuestas posteriores."
          ]
        },
        {
          "title": "3. Finalidades",
          "paragraphs": [
            "Usamos los datos para mantener cuentas, autenticar, guardar favoritos, gestionar comentarios y me gusta, aplicar permisos, atender solicitudes, prevenir abusos y proteger el servicio. No usamos los datos de acceso de Google para fines ajenos."
          ]
        },
        {
          "title": "4. Proveedores y divulgación",
          "paragraphs": [
            "Supabase proporciona autenticación y base de datos; Cloudflare, alojamiento, distribución y seguridad. Cuando el acceso por correo se configura con Resend, este procesa destinatarios, contenido del correo de acceso e información de entrega. El proveedor de acceso elegido aplica sus propias políticas a la autorización.",
            "Solo tratamos o divulgamos información necesaria para esos servicios, solicitudes autorizadas, investigaciones de seguridad u obligaciones legales. El personal operativo puede acceder a datos necesarios para mantenimiento y soporte. No vendemos datos personales ni proporcionamos datos de Google a plataformas publicitarias. Los proveedores pueden tratar datos fuera de tu país."
          ]
        },
        {
          "title": "5. Almacenamiento del navegador",
          "paragraphs": [
            "El almacenamiento local mantiene sesión, idioma y tema. El servicio de identidad puede conservar o renovar tokens de sesión. Cerrar sesión termina la sesión actual; borrar los datos del sitio elimina preferencias locales. El código actual no integra rastreadores publicitarios ni análisis de marketing externos. La infraestructura puede usar cookies de seguridad necesarias."
          ]
        },
        {
          "title": "6. Conservación y eliminación",
          "paragraphs": [
            "Conservamos los datos necesarios mientras utilizas tu cuenta. Puedes retirar me gusta, favoritos y tus comentarios. Para acceder, corregir, exportar datos o eliminar la cuenta, escribe al contacto inferior con información suficiente para verificar la titularidad. No envíes contraseñas ni tokens.",
            "Tras verificar la solicitud, gestionamos la eliminación o anonimización de los datos activos pertinentes. Podemos conservar lo necesario por obligaciones legales, disputas o investigaciones de seguridad. Las copias de respaldo y registros de proveedores pueden caducar posteriormente según sus ciclos; no garantizamos borrado inmediato de todas las copias."
          ]
        },
        {
          "title": "7. Revocación y seguridad",
          "paragraphs": [
            "Puedes revocar el acceso desde las conexiones de terceros de tu cuenta de Google. Esto no elimina automáticamente los datos ya guardados por el sitio; solicita su eliminación por separado. Aplicamos HTTPS, políticas de acceso a la base y permisos por rol, sin poder garantizar seguridad absoluta. Comunica incidencias al contacto inferior."
          ]
        },
        {
          "title": "8. Cambios y contacto",
          "paragraphs": [
            "Actualizaremos la fecha y esta página cuando cambien las funciones o prácticas, avisaremos adecuadamente de cambios importantes y obtendremos la autorización necesaria antes de nuevos usos. Envía consultas de privacidad, eliminación o soporte al correo inferior."
          ]
        },
        {
          "title": "Configuración de cuenta y preferencias",
          "paragraphs": [
            "Guardamos tu usuario único, fecha de configuración del perfil, idioma de interfaz y tema. Las preferencias de cuenta se aplican al entrar; las de visitantes se guardan en el navegador actual. Las publicaciones muestran el original; las artículos pueden tener traducciones de la administración. La búsqueda pública no expone borradores, favoritos privados ni preferencias.",
            "Guardamos preferencias de idioma de artículos, contenido externo y visibilidad de reposts. Los reposts y las citas publicadas son públicos; deshacer un repost no elimina el original. Cuando el original se retira o elimina, su texto deja de aparecer en la cita. Las acciones sensibles usan códigos por correo. Supabase verifica los códigos y conserva los registros de autenticación; Resend entrega el correo. El sitio no almacena los códigos introducidos."
          ]
        }
      ]
    },
    "terms": {
      "title": "Condiciones de uso",
      "intro": "Teamcn es un sitio de artículos y debates tecnológicos. Estas reglas se aplican a las funciones comunitarias.",
      "sections": [
        {
          "title": "1. Servicio y cuentas",
          "paragraphs": [
            "Los artículos, publicaciones y políticas públicas se pueden leer sin iniciar sesión. Los miembros activos pueden publicar y gestionar sus propias entradas, dar me gusta, guardar y comentar. La administración publica artículos y puede editar, fijar, bloquear, retirar o eliminar publicaciones, artículos y comentarios. Protege tu cuenta y no suplantes a otras personas."
          ]
        },
        {
          "title": "2. Reglas de contenido",
          "paragraphs": [
            "Respeta a los demás, cita fuentes y responsabilízate de tus aportaciones. Se prohíben acoso, spam, infracciones, fraude, vulneraciones de privacidad y contenido ilegal, así como crear o distribuir imágenes íntimas sin consentimiento, incluidas las generadas con IA. Los administradores pueden moderar comentarios, restringir funciones o desactivar cuentas infractoras."
          ]
        },
        {
          "title": "3. Tecnología e IA",
          "paragraphs": [
            "El sitio informa sobre tecnología e IA; no ofrece generación de imágenes, vídeos ni contenido íntimo. El acceso con Google solo autentica cuentas y no genera contenido ni utiliza datos de Google para entrenar modelos generales de IA."
          ]
        },
        {
          "title": "4. Derechos y contacto",
          "paragraphs": [
            "Conservas los derechos de tus publicaciones y comentarios y permites almacenarlos, mostrarlos y moderarlos para prestar el servicio. Respeta los derechos de autor, las fuentes y la privacidad. No compartas material sin permiso. Los artículos y conversaciones son informativas, no asesoramiento profesional."
          ]
        }
      ]
    }
  }
};

const walletLegal:Record<Locale,{privacy:Section;terms:Section}>={
  "zh-CN": {
    "privacy": {
      "title": "钱包与链上交易",
      "paragraphs": [
        "使用钱包时，我们保存充值订单、用于识别付款的精确金额、收款地址、链上付款地址及交易哈希、提现地址、积分变动、打赏双方、审核状态与时间。充值无需连接钱包或签名。钱包记录仅向本人和获授权的财务管理人员开放；链上的地址、金额和交易是公开的，可能与站内账号产生关联。Supabase 保存账本，Cloudflare 执行到账核验，TronGrid 提供 TRON 查询。我们不索取私钥或助记词。",
        "资金记录用于入账、提现、对账、争议处理和防止重复付款。账本不允许直接覆盖或删除；账号删除请求涉及未结算资金或财务记录时，需要联系支持人员进行结算和适用保留义务审查。"
      ]
    },
    "terms": {
      "title": "积分、打赏与提现",
      "paragraphs": [
        "资金功能在完成配置并开放后才可使用。仅支持 TRON（TRC20）USDT；1 USDT = 1 积分。先创建充值订单，再向页面显示的地址发送完整的精确金额。订单金额在所选金额上增加不足 0.01 USDT 以识别付款，全部实际到账金额均兑换积分，不额外收取该差额。可使用支持完整金额的钱包或交易所；提币手续费扣除后须足额到账，不要取整或拆分。充值网络资源费由用户承担。订单有效期 30 分钟，精确金额不会重新分配给其他用户；按原金额支付的迟到款仍在核验后计入原账号。金额错误、订单创建前付款、其他网络或代币不自动入账，请联系支持对账。链上最终确认和索引延迟可能影响到账时间。",
        "充值积分用于打赏，收到的打赏可申请提现。最低提现 1 USDT（1 积分），手续费为申请金额的 1%，不足 0.0001 USDT 的手续费向上取整；例如申请 1 USDT，到账 0.99 USDT。平台另行承担支付时的 TRON 网络资源费用。提现需邮箱验证码验证，经后台审核后人工转账，不承诺即时到账。待审核申请可取消；开始处理后资金继续冻结至付款核验或人工对账。打赏确认后立即记账，请核对收款人和金额。"
      ]
    }
  },
  "en": {
    "privacy": {
      "title": "Wallet and blockchain transactions",
      "paragraphs": [
        "We store deposit orders, exact payment-identifying amounts, receiving and on-chain sender addresses, transaction hashes, withdrawal addresses, point transfers, tipping participants, review status and timestamps. Deposits need no wallet connection or signature. Wallet records are available to their owner and authorized financial administrators. On-chain addresses, amounts and transactions are public and may become linked to your account. Supabase stores the ledger, Cloudflare verifies transfers, and TronGrid supplies TRON data. We do not request private keys or recovery phrases.",
        "Financial records support settlement, reconciliation, dispute handling and duplicate-payment prevention. The ledger cannot be directly overwritten or deleted. Account deletion involving outstanding balances or financial records requires support review of settlement and applicable retention obligations."
      ]
    },
    "terms": {
      "title": "Points, tips and withdrawals",
      "paragraphs": [
        "Payments require configuration and activation. Only TRON (TRC20) USDT is supported; 1 USDT equals 1 point. Create an order before sending the full exact amount to the displayed address. An identifying amount of less than 0.01 USDT is added to your selection; the entire received amount becomes points, so this difference is not a fee. Use a wallet or exchange that supports the full amount; the amount received after withdrawal fees must match. Do not round or split payments. You pay deposit network resources. Orders last 30 minutes. Exact amounts are never reassigned to another user; late payments of the original amount are credited to the same account after verification. Incorrect amounts, transfers before order creation, other networks or tokens are not credited automatically; contact support. Final confirmation and indexing may delay credit.",
        "Purchased points fund tips; tip earnings can be withdrawn. The minimum is 1 USDT (1 point). The fee is 1% of the requested amount, rounded up to the nearest 0.0001 USDT. A 1 USDT request pays out 0.99 USDT. The platform separately covers TRON network resources for payouts. Withdrawals require email verification, administrator review and manual payment, with no instant-payment promise. Pending requests may be cancelled; processing funds stay held until payment verification or manual reconciliation. Confirmed tips are booked immediately; check the recipient and amount."
      ]
    }
  },
  "zh-TW": {
    "privacy": {
      "title": "錢包與鏈上交易",
      "paragraphs": [
        "我們儲存儲值訂單、識別付款的精確金額、收款地址、鏈上付款地址與交易雜湊、提領地址、積分異動、打賞雙方、審核狀態及時間。儲值無需連接錢包或簽名。紀錄僅供本人與獲授權的財務管理人員存取；鏈上地址、金額及交易公開可見，可能與帳號產生關聯。Supabase 儲存帳本，Cloudflare 核驗交易，TronGrid 提供 TRON 查詢。我們不索取私鑰或助記詞。",
        "資金紀錄用於入帳、對帳、爭議處理與防止重複付款，帳本不可直接覆寫或刪除。刪除帳號涉及未結算資金或財務紀錄時，須聯絡支援人員審查結算與適用的保留義務。"
      ]
    },
    "terms": {
      "title": "積分、打賞與提領",
      "paragraphs": [
        "資金功能完成設定並開放後才可使用。僅支援 TRON（TRC20）USDT；1 USDT = 1 積分。先建立訂單，再向畫面地址發送完整精確金額。訂單在所選金額上增加不足 0.01 USDT 以識別付款，全部實際到帳金額均兌換積分，差額不是手續費。可使用支援完整金額的錢包或交易所；提幣費用扣除後須足額到帳，不要取整或拆分。儲值網路資源費由使用者承擔。訂單有效期 30 分鐘，精確金額不會重新分配給他人；按原金額支付的遲到款仍在核驗後計入原帳號。金額錯誤、訂單建立前付款、其他網路或代幣不自動入帳，請聯絡支援。最終確認及索引延遲可能影響入帳時間。",
        "儲值積分用於打賞，打賞收入可提領。最低 1 USDT（1 積分），手續費 1%，不足 0.0001 USDT 向上取整；申請 1 USDT 到帳 0.99 USDT。平台另行承擔付款的 TRON 網路資源費用。提領須信箱驗證碼驗證、後台審核及人工付款，不承諾即時到帳。待審核可取消；處理中持續凍結至付款核驗或人工對帳。打賞確認後立即記帳，請核對對象與金額。"
      ]
    }
  },
  "ja": {
    "privacy": {
      "title": "ウォレットとブロックチェーン",
      "paragraphs": [
        "入金注文、支払い識別用の正確な金額、入金先とチェーン上の送金元、取引ハッシュ、出金先、ポイント移動、チップの当事者、審査状況と日時を保存します。入金にウォレット接続や署名は不要です。記録は本人と権限を持つ財務管理者のみ閲覧できます。チェーン上の情報は公開され、アカウントと結び付く場合があります。Supabase が台帳を保存し、Cloudflare が検証し、TronGrid が TRON データを提供します。秘密鍵や復元フレーズは要求しません。",
        "台帳は決済、照合、紛争対応、重複払い防止に使われ、直接の上書きや削除はできません。残高や財務記録を伴うアカウント削除は、サポートが決済と適用される保存義務を確認します。"
      ]
    },
    "terms": {
      "title": "ポイント、チップ、出金",
      "paragraphs": [
        "設定・有効化後に決済を利用できます。TRON（TRC20）USDT のみ対応し、1 USDT は 1 ポイントです。注文を作成してから表示の宛先へ正確な全額を送金してください。識別用に 0.01 USDT 未満を加算しますが、受取全額をポイントにするため手数料ではありません。正確な金額に対応するウォレットや取引所を利用し、取引所手数料控除後の受取額を一致させてください。丸めや分割はしないでください。入金ネットワーク費用は利用者負担です。注文は 30 分間有効です。金額は他の利用者に再割当てされず、元の金額の遅延入金も検証後に同じアカウントへ反映します。金額違い、注文作成前の送金、他ネットワークや通貨は自動反映されません。サポートへ連絡してください。最終確認や索引の遅延で反映が遅れる場合があります。",
        "購入ポイントはチップに使用し、受け取ったチップを出金できます。最低額は 1 USDT（1 ポイント）、手数料は申請額の 1%（0.0001 USDT 単位で切り上げ）です。1 USDT の申請では 0.99 USDT を受け取ります。送金の TRON ネットワーク費用は別途プラットフォームが負担します。メール確認と管理者審査後に手動送金し、即時支払いは保証しません。審査前はキャンセルできますが、処理中は検証または手動照合まで保留します。チップは確定後すぐ記帳されます。"
      ]
    }
  },
  "es": {
    "privacy": {
      "title": "Cartera y transacciones en cadena",
      "paragraphs": [
        "Guardamos órdenes de depósito, importes exactos que identifican los pagos, direcciones receptoras y remitentes en cadena, hashes, direcciones de retiro, movimientos de puntos, participantes de propinas, revisión y fechas. No se requiere conexión de cartera ni firma. Solo el titular y los administradores financieros autorizados acceden a los registros. Los datos en cadena son públicos y pueden vincularse a tu cuenta. Supabase guarda el libro contable, Cloudflare verifica las transferencias y TronGrid proporciona datos de TRON. No pedimos claves privadas ni frases de recuperación.",
        "Los registros permiten liquidar, conciliar, resolver disputas y evitar pagos duplicados. El libro contable no se sobrescribe ni se elimina directamente. La eliminación de cuentas con saldos o registros financieros requiere revisar la liquidación y las obligaciones de conservación con soporte."
      ]
    },
    "terms": {
      "title": "Puntos, propinas y retiros",
      "paragraphs": [
        "Los pagos requieren configuración y activación. Solo admitimos USDT TRON (TRC20); 1 USDT equivale a 1 punto. Crea una orden y envía el importe exacto completo a la dirección mostrada. Se añaden menos de 0,01 USDT para identificar el pago; todo lo recibido se convierte en puntos, por lo que no es una comisión. Usa una cartera o exchange que admita el importe completo, descontando las comisiones de retiro antes de calcular lo recibido. No redondees ni dividas el pago. Pagas los recursos de red. Las órdenes duran 30 minutos. Los importes nunca se reasignan a otra persona; un pago tardío del importe original se acredita a la misma cuenta tras verificarlo. Los importes incorrectos, envíos anteriores a la orden y otras redes o tokens no se acreditan automáticamente; contacta con soporte. La confirmación final y la indexación pueden retrasar el abono.",
        "Los puntos comprados sirven para dar propinas; las propinas recibidas se pueden retirar. El mínimo es 1 USDT (1 punto) y la comisión es el 1%, redondeada hacia arriba a 0,0001 USDT. Una solicitud de 1 USDT entrega 0,99 USDT. La plataforma cubre por separado los recursos de red TRON del pago. Los retiros requieren verificación por correo, revisión y transferencia manual; no son inmediatos. Se pueden cancelar mientras están pendientes; durante el procesamiento siguen retenidos hasta verificar o conciliar el pago. Las propinas se contabilizan al confirmar."
      ]
    }
  }
};
for(const locale of Object.keys(walletLegal) as Locale[]){legalCopy[locale].privacy.sections.push(walletLegal[locale].privacy);legalCopy[locale].terms.sections.push(walletLegal[locale].terms);}
for(const locale of Object.keys(c2cLegal) as Locale[]){const c=c2cLegal[locale];legalCopy[locale].privacy.sections.push({title:c.title,paragraphs:[c.privacy]});legalCopy[locale].terms.sections.push({title:c.title,paragraphs:[c.terms]});}
for(const locale of Object.keys(identityLegal) as Locale[]){const c=identityLegal[locale];legalCopy[locale].privacy.sections.push({title:c.title,paragraphs:[c.privacy]});legalCopy[locale].terms.sections.push({title:c.title,paragraphs:[c.terms]});}

const predictionLegal = {
  "zh-CN": {
    "title": "预测份额与兑换比例",
    "terms": "新充值订单按 1 USDT = 1 积分兑换，历史积分数量保持不变。调整前创建的订单仅首次到账按原报价兑换，后续重复付款按当前比例；以订单页面显示为准。小于 0.0001 积分的到账余数保留并累计。预测交易的正确结果每份结算 1 积分、错误结果 0 积分、无效市场 0.5 积分。结果按公布的规则和来源由 Teamcn 审核，经过公示与异议处理后最终确认。买卖及结算所得回到普通积分，不自动成为可提现的打赏收入。市场价格和成交预估不保证成交；预测份额交易不增加打赏等级。",
    "privacy": "我们保存预测市场关注、订单、成交、持仓成本、异议及结算记录。公开展示市场、汇总订单簿、匿名成交和结果证据；个人余额、完整订单和关注仅对本人及获授权的管理员开放。主动分享订单时会创建公开快照，默认隐藏成交数量，可撤销分享；已被他人复制的信息无法保证收回。"
  },
  "en": {
    "title": "Prediction shares and conversion",
    "terms": "New deposit orders use 1 USDT = 1 point; historical point counts stay unchanged. Orders created before the change retain their quoted rate for the first payment only; subsequent payments use the current rate, as shown on the order page. Received fractions below 0.0001 point are carried forward. Winning prediction shares settle at 1 point, losing shares at 0, and void markets at 0.5 per share. Teamcn reviews the published rules and source, announces evidence, and handles disputes before final resolution. Trading and settlement proceeds return to ordinary points, not automatically to withdrawable tip earnings. Quotes and estimated execution do not guarantee fills. Prediction trades do not increase tipping levels.",
    "privacy": "We store market follows, orders, trades, acquisition costs, disputes and settlements. Markets, aggregate order books, anonymous trades and resolution evidence are public. Balances, full orders and follows are available only to their owner and authorized administrators. Sharing an order creates a public snapshot with quantity hidden by default; sharing can be revoked, but copies made by others cannot necessarily be recalled."
  },
  "zh-TW": {
    "title": "預測份額與兌換比例",
    "terms": "新儲值訂單按 1 USDT = 1 積分兌換，歷史積分數量維持不變。調整前建立的訂單僅首次到帳按原報價兌換，之後重複付款按目前比例，以訂單頁顯示為準。小於 0.0001 積分的到帳餘數會保留累計。預測結果正確每份結算 1 積分、錯誤 0 積分、無效市場 0.5 積分。Teamcn 按公開規則和來源審核結果，經公示與異議處理後確認。交易與結算所得回到普通積分，不會自動成為可提領的打賞收入。報價與成交預估不保證成交，預測交易不增加打賞等級。",
    "privacy": "我們儲存市場關注、訂單、成交、持倉成本、異議及結算紀錄。市場、彙總訂單簿、匿名成交與結果證據公開；個人餘額、完整訂單及關注僅供本人與獲授權管理員存取。主動分享訂單會建立公開快照，預設隱藏數量，可撤銷分享；他人已複製的內容不一定能收回。"
  },
  "ja": {
    "title": "予測持分と交換比率",
    "terms": "新規入金注文は 1 USDT = 1 ポイントです。過去のポイント数は変更しません。変更前の注文は初回入金のみ当初の比率を保持し、その後の入金には現在の比率を適用します。注文画面を確認してください。0.0001 ポイント未満の端数は繰り越します。予測的中は1口1ポイント、不的中は0、無効市場は1口0.5で決済します。Teamcn が公開ルールと情報源を審査し、根拠の公示と異議処理後に結果を確定します。売却・決済代金は通常ポイントに戻り、出金可能なチップ収入には自動で変わりません。参考価格や見積もりは約定を保証しません。予測取引はチップレベルに加算されません。",
    "privacy": "市場フォロー、注文、取引、取得原価、異議、決済を保存します。市場、集計注文板、匿名取引と結果の根拠は公開します。残高、注文詳細とフォローは本人と権限を持つ管理者のみ閲覧できます。注文を共有すると公開スナップショットが作られ、数量は既定で非表示です。共有を解除できますが、第三者のコピーは回収できない場合があります。"
  },
  "es": {
    "title": "Participaciones y conversión",
    "terms": "Las nuevas órdenes de depósito usan 1 USDT = 1 punto; las cantidades históricas de puntos no cambian. Las órdenes anteriores conservan su tipo original solo para el primer pago; los posteriores usan el tipo actual mostrado en la orden. Las fracciones inferiores a 0,0001 punto se acumulan. Las participaciones ganadoras liquidan a 1 punto, las perdedoras a 0 y los mercados nulos a 0,5 por participación. Teamcn revisa las reglas y fuentes publicadas, presenta las pruebas y resuelve las disputas antes del resultado final. Los ingresos de venta y liquidación vuelven a puntos ordinarios, no automáticamente a propinas retirables. Los precios y estimaciones no garantizan ejecución. Estas operaciones no aumentan el nivel de propinas.",
    "privacy": "Guardamos seguimientos de mercados, órdenes, operaciones, costes de adquisición, disputas y liquidaciones. Los mercados, libros agregados, operaciones anónimas y pruebas del resultado son públicos. Solo el titular y administradores autorizados pueden acceder a saldos, órdenes completas y seguimientos. Compartir una orden crea una instantánea pública que oculta la cantidad por defecto. Puedes revocar la publicación, pero puede ser imposible recuperar copias de terceros."
  }
};
for(const locale of Object.keys(predictionLegal) as Locale[]){const c=predictionLegal[locale];legalCopy[locale].privacy.sections.push({title:c.title,paragraphs:[c.privacy]});legalCopy[locale].terms.sections.push({title:c.title,paragraphs:[c.terms]});}
