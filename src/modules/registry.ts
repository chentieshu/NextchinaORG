// Modules define their own UI and data adapters; database RLS remains the authority.
export const modules = {
 news:{enabled:true,canPublish:['editor','super_admin']},
 community:{enabled:true,canComment:['member','editor','super_admin']},
 bookmarks:{enabled:true,private:true},
 ugc:{enabled:false,requiresModeration:true},
} as const;
