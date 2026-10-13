import type { Locale } from './i18n';
export type Category=string;
export interface ContentCategory {key:string;labels:Record<Locale,string>;position:number;enabled:boolean;updated_at:string;}
export type Role='member'|'editor'|'super_admin';
export interface Profile {profile_completed_at?:string|null;ui_locale?:Locale|null;theme?:'light'|'dark'|'system';id:string;display_name:string;role:Role;disabled:boolean;created_at:string;avatar_key?:string|null;avatar_source?:'provider'|'custom'|'none';updated_at?:string;handle?:string;bio?:string;website?:string;}
export interface RichNode {type?:string;text?:string;attrs?:Record<string,unknown>;marks?:{type:string;attrs?:Record<string,unknown>}[];content?:RichNode[];}
export interface Translation {title:string;summary:string;body:string;document?:RichNode;}
export interface Article {id:string;slug:string;category:Category;status:'draft'|'published'|'archived';translations:Partial<Record<Locale,Translation>>;original_locale:Locale;source_url:string|null;cover_style:number;author_id:string|null;published_at:string|null;created_at:string;updated_at?:string;featured:boolean;content_type?:'news'|'post';locked?:boolean;moderated?:boolean;author_name?:string;author_handle?:string;author_avatar_key?:string|null;demo?:boolean;like_count?:number;comment_count?:number;thumbnail_url?:string|null;media?:import('./external-content').MediaItem[];}
export interface Comment {id:string;article_id:string;user_id:string;body:string;document?:RichNode|null;created_at:string;updated_at?:string;display_name?:string;avatar_key?:string|null;article?:{content_type:'news'|'post'};parent_id?:string|null;depth?:number;deleted?:boolean;parent_name?:string;reply_count?:number;}
export interface SiteSettings {updated_at?:string;id:boolean;notice:string;comments_enabled:boolean;ugc_enabled:boolean;}
