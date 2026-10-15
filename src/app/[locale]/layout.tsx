import {experienceCopy} from '@/lib/experience-copy';
import {notFound} from 'next/navigation';
import {locales,isLocale,dictionaries} from '@/lib/i18n';
import {Provider} from '@/components/Provider';
import {Shell} from '@/components/Shell';
export function generateStaticParams(){return locales.map(locale=>({locale}));}
export const dynamicParams=false;
export async function generateMetadata({params}:{params:Promise<{locale:string}>}){const{locale}=await params;if(!isLocale(locale))return{};const t=dictionaries[locale];return{title:{absolute:`Teamcn — ${t.home} / ${t.news}`},description:experienceCopy[locale].forumIntro};}
export default async function Layout({children,params}:{children:React.ReactNode;params:Promise<{locale:string}>}){const{locale}=await params;if(!isLocale(locale))notFound();return <Provider locale={locale}><Shell>{children}</Shell></Provider>;}
