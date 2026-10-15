import type {Metadata} from 'next';
import '@/app/globals.css';import '@/app/social.css';import '@/app/shell.css';import '@/app/chinateam.css';import '@/app/mobile.css';import '@/app/ux.css';import '@/app/composer.css';import '@/app/threads.css';import '@/components/data/data.css';
export const metadata:Metadata={title:'ChinaTeam · 管理中心',robots:{index:false,follow:false},icons:{icon:'/icon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
