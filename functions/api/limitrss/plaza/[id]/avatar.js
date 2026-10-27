import {respond} from '../../../../_lib/plaza.js';
// Publish only the avatar of the original contributor to a currently public feed.
// User IDs, emails and authentication tokens are never included in the public response.
export async function onRequestGet({params,env}) {
 if(!/^[a-f0-9]{32}$/.test(params.id))return respond({error:'not_found'},404);
 try {
  const row=await env.DB.prepare(`SELECT u.avatar_b64,u.avatar_content_type FROM plaza_contributions p JOIN users u ON u.id=p.user_id JOIN plaza_feeds f ON f.id=p.feed_id WHERE f.id=? AND f.published=1 AND NOT EXISTS (SELECT 1 FROM plaza_feed_controls c WHERE c.feed_id=f.id AND (c.hidden=1 OR c.deleted_at IS NOT NULL))`).bind(params.id).first();
  if(!row?.avatar_b64 || !['image/png','image/jpeg','image/webp'].includes(row.avatar_content_type))return respond({error:'not_found'},404);
  return new Response(Uint8Array.from(atob(row.avatar_b64),char=>char.charCodeAt(0)),{headers:{'Content-Type':row.avatar_content_type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return respond({error:'unavailable'},503);}
}
