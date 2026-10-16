'use client';
import {Suspense} from 'react';
import {useSearchParams} from 'next/navigation';
import {ForumPage} from './Forum';
import {NewsPage} from '@/modules/news/NewsExperience';
function SquareRoute(){const params=useSearchParams();return params.get('tab')==='articles'?<NewsPage/>:<ForumPage/>;}
export default function Square(){return <Suspense><SquareRoute/></Suspense>;}
