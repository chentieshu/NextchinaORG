import Square from '@/modules/forum/Square';
import {isLocale} from '@/lib/i18n';
import {navigationCopy} from '@/lib/navigation-copy';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}){const{locale}=await params;return isLocale(locale)?{title:{absolute:`${navigationCopy[locale].square} · Teamcn`},alternates:{canonical:`/${locale}/square/`}}:{};}
export default Square;
