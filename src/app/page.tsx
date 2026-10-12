import Link from 'next/link';
import {RootRedirect} from '@/components/RootRedirect';
export default function Page(){return <><RootRedirect/><main className="empty-state"><h1>NextChina.org</h1><p>New perspectives. Shared possibilities.</p><Link className="button primary" href="/zh-CN/">进入网站 / Explore</Link></main></>;}
