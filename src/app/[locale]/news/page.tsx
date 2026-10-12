import {NewsPage} from '@/modules/news/NewsExperience';
import {Suspense} from 'react';
export default function Page(){return <Suspense fallback={<main id="main" className="empty-state">NextChina.org</main>}><NewsPage/></Suspense>;}
