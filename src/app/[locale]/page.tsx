import Home from '@/components/Home';
import {isLocale,locales} from '@/lib/i18n';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;if(!isLocale(locale))return{};
 return {alternates:{canonical:`/${locale}/`,languages:Object.fromEntries([...locales.map(l=>[l,`/${l}/`]),['x-default','/zh-CN/']])}};
}
export default Home;
