import { createClient, type SupabaseClient } from '@supabase/supabase-js';
let client:SupabaseClient|null=null;
export type AuthProviders = Record<'google'|'github'|'x'|'email',boolean>;
export async function getAuthProviders(signal:AbortSignal):Promise<AuthProviders>{
 const response=await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??''},signal});
 if(!response.ok)throw new Error('Auth settings unavailable');
 const {external}=await response.json();
 // This project's Auth settings omit X OAuth 2.0 despite a working authorize endpoint.
 const x=typeof external?.x==='boolean'?external.x:process.env.NEXT_PUBLIC_SUPABASE_X_ENABLED==='true';
 return {google:external?.google===true,github:external?.github===true,x,email:external?.email===true};
}
export function getSupabase(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return null;
 if(!client)client=createClient(url,key,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 return client;
}
