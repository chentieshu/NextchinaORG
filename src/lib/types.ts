import type { Locale } from './i18n';
export type Category='ai'|'opensource'|'hardware'|'design'|'frontier';
export type Role='member'|'editor'|'super_admin';
export interface Profile {id:string;display_name:string;role:Role;disabled:boolean;created_at:string;}
export interface RichNode {type?:string;text?:string;attrs?:Record<string,unknown>;marks?:{type:string;attrs?:Record<string,unknown>}[];content?:RichNode[];}
export interface Translation {title:string;summary:string;body:string;document?:RichNode;}
export interface Article {id:string;slug:string;category:Category;status:'draft'|'published'|'archived';translations:Partial<Record<Locale,Translation>>;original_locale:Locale;source_url:string|null;cover_style:number;author_id:string|null;published_at:string|null;created_at:string;updated_at?:string;featured:boolean;content_type?:'news'|'post';locked?:boolean;moderated?:boolean;author_name?:string;demo?:boolean;like_count?:number;comment_count?:number;}
export interface Comment {id:string;article_id:string;user_id:string;body:string;created_at:string;display_name?:string;}
export interface SiteSettings {id:boolean;notice:string;comments_enabled:boolean;ugc_enabled:boolean;}
