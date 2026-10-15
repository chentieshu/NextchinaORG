import type {Metadata,Viewport} from 'next';
import './globals.css';
import './social.css';
import './shell.css';
import './chinateam.css';
import './search.css';
import './mobile.css';
import './composer.css';
import './threads.css';
import './ux.css';
import '@/components/data/data.css';
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover'};
export const metadata:Metadata={metadataBase:new URL(process.env.NEXT_PUBLIC_SITE_URL??'https://teamcn.org'),title:{default:'Teamcn — 论坛与文章',template:'%s · Teamcn'},description:'Teamcn is an open article and discussion community. Read articles, publish posts and join conversations.',openGraph:{siteName:'Teamcn',type:'website'},icons:{icon:'/icon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN" suppressHydrationWarning><body>{children}</body></html>;}
