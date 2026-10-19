import type {Metadata,Viewport} from 'next';
import './globals.css';
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover'};
export const metadata:Metadata={metadataBase:new URL(process.env.NEXT_PUBLIC_SITE_URL??'https://pg520.app'),title:{default:'Teamcn — 预测市场与广场',template:'%s · Teamcn'},description:'Explore prediction markets, follow prices, and share posts and articles in the Teamcn Square.',openGraph:{siteName:'Teamcn',type:'website'},icons:{icon:'/icon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN" suppressHydrationWarning><body>{children}</body></html>;}
