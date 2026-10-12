import type {Article} from './types';
export function contentHref(article:Article,locale:string){return `/${locale}/${article.content_type==='post'?'community/':'news/'}?id=${article.id}`;}
