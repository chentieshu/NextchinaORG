import {notFound} from 'next/navigation';
import {isLocale,locales} from '@/lib/i18n';
import {legalCopy} from '@/lib/legal';
import {LegalPage} from '@/modules/about/LegalPage';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}){
 const{locale}=await params;if(!isLocale(locale))return{};
 return {title:legalCopy[locale].terms.title,description:legalCopy[locale].terms.intro,alternates:{canonical:`/${locale}/terms/`,languages:Object.fromEntries(locales.map(l=>[l,`/${l}/terms/`]))}};
}
export default async function Page({params}:{params:Promise<{locale:string}>}){const{locale}=await params;if(!isLocale(locale))notFound();return <LegalPage locale={locale} kind="terms"/>;}
