import {Provider} from '@/components/Provider';
import {Shell} from '@/components/Shell';
import Home from '@/components/Home';
export const metadata={alternates:{canonical:'/'}};
export default function Page(){return <Provider locale="zh-CN"><Shell><Home/></Shell></Provider>;}
