export const adminTabs=['dashboard','posts','articles','moderation','members','categories','settings','audit','monitor','wallet','market'] as const;
export type AdminTab=typeof adminTabs[number];
export const contentTabs:AdminTab[]=['dashboard','posts','articles','moderation'];
export const canOpenTab=(value:string,owner:boolean):value is AdminTab=>adminTabs.includes(value as AdminTab)&&(owner||contentTabs.includes(value as AdminTab));
export function parseAdminView(hash:string,owner:boolean){const [value,query]=hash.replace(/^#/,'').split('?');const status=new URLSearchParams(query).get('status')??'all';return {tab:canOpenTab(value,owner)?value:'dashboard' as AdminTab,status:['draft','published','archived'].includes(status)?status:'all'};}
