import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:{default:'OmniRemix — 看见科技，连接可能',template:'%s · OmniRemix'},description:'OmniRemix — An independent technology news community. Remix perspectives. Reimagine tomorrow.',icons:{icon:'/icon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN" suppressHydrationWarning><body>{children}</body></html>;}
