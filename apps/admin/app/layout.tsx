import type {Metadata} from 'next';
import '@/styles/shared.css';
import '@/modules/admin/admin.css';
export const metadata:Metadata={title:'Teamcn · 管理中心',robots:{index:false,follow:false},icons:{icon:'/icon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
