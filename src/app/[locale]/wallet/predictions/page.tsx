import {redirect} from 'next/navigation';
export const metadata={robots:{index:false,follow:false}};
export default async function PredictionsRedirect({params}:{params:Promise<{locale:string}>}){const{locale}=await params;redirect(`/${locale}/predictions/`);}
