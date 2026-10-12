// Modules own their UI; database policies enforce permissions.
export const modules={news:{enabled:true,canPublish:['editor','super_admin']},forum:{enabled:true,canPublish:['member','editor','super_admin']},community:{enabled:true,canComment:['member','editor','super_admin']},bookmarks:{enabled:true,private:true},ugc:{enabled:true,moderation:'post-publication'}} as const;
