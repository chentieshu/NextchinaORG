import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={metadataBase:new URL(process.env.NEXT_PUBLIC_SITE_URL??'https://nextchina.org'),title:{default:'NextChina.org — 看见科技，连接可能',template:'%s · NextChina.org'},description:'NextChina.org — An independent technology news community. New perspectives. Shared possibilities.',openGraph:{siteName:'NextChina.org',type:'website'},icons:{icon:'/icon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN" suppressHydrationWarning><body>{children}</body></html>;}
