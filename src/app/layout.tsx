import type {Metadata,Viewport} from 'next';
import './globals.css';
import './social.css';
import './shell.css';
import './chinateam.css';
import './search.css';
import './mobile.css';
import './composer.css';
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover'};
export const metadata:Metadata={metadataBase:new URL(process.env.NEXT_PUBLIC_SITE_URL??'https://chinateam.org'),title:{default:'ChinaTeam — 论坛与新闻',template:'%s · ChinaTeam'},description:'ChinaTeam is an open news and discussion community. Read news, publish posts and join conversations.',openGraph:{siteName:'ChinaTeam',type:'website'},icons:{icon:'/icon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN" suppressHydrationWarning><body>{children}</body></html>;}
