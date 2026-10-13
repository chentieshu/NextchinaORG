import type {Metadata} from 'next';
import './globals.css';
import './social.css';
export const metadata:Metadata={metadataBase:new URL(process.env.NEXT_PUBLIC_SITE_URL??'https://nextchina.org'),title:{default:'NextChina.org — 论坛与新闻',template:'%s · NextChina.org'},description:'NextChina.org is an open news and discussion community. Read news, publish posts and join conversations.',openGraph:{siteName:'NextChina.org',type:'website'},icons:{icon:'/icon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN" suppressHydrationWarning><body>{children}</body></html>;}
