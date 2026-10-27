import {getAuthUser} from './db.js';
import {readSmallJson,quota,isRssHubFeed} from './plaza.js';
export const sharesJson=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization'}});
class ShareError extends Error{constructor(code,status=400){super(code);this.status=status;}}
async function ownerRequest(context,handler){
 const started=Date.now();
 try{
  const user=await getAuthUser(context.request,context.env);
  if(!user||!await context.env.DB.prepare('SELECT id FROM users WHERE id=?').bind(user.id).first())throw new ShareError('unauthorized',401);
  const response=await handler({...context,user});
  console.log(JSON.stringify({module:'plaza_my_shares',event:'request_completed',method:context.request.method,status:response.status,durationMs:Date.now()-started}));return response;
 }catch(error){const code=error instanceof ShareError?error.message:'unavailable',status=error instanceof ShareError?error.status:503;console.log(JSON.stringify({module:'plaza_my_shares',event:'request_failed',code,status,durationMs:Date.now()-started}));return sharesJson({error:code},status);}
}
const source='FROM plaza_contributions p JOIN plaza_feeds f ON f.id=p.feed_id LEFT JOIN plaza_feed_controls c ON c.feed_id=f.id';
export function listMyShares(context){return ownerRequest(context,async({request,env,user})=>{
 const query=new URL(request.url).searchParams,q=(query.get('q')||'').trim().slice(0,100),state=query.get('state');
 const where=['p.user_id=?','c.deleted_at IS NULL'],args=[user.id];
 if(q){where.push("(f.title LIKE ? ESCAPE '\\' OR f.url LIKE ? ESCAPE '\\')");const term='%'+q.replace(/[\\%_]/g,'\\$&')+'%';args.push(term,term);}
 if(state==='hidden')where.push('c.hidden=1');
 if(state==='public')where.push('f.published=1 AND COALESCE(c.hidden,0)=0');
 if(state==='pending')where.push('f.published=0 AND COALESCE(c.hidden,0)=0');
 const clause=where.join(' AND '),pageSize=20;
 const count=await env.DB.prepare(`SELECT COUNT(*) AS total ${source} WHERE ${clause}`).bind(...args).first();
 const page=Math.min(Math.max(1,Math.min(10000,parseInt(query.get('page'))||1)),Math.max(1,Math.ceil(count.total/pageSize)));
 const rows=await env.DB.prepare(`SELECT f.id,f.title,f.url,f.icon,f.category,f.status,f.published,p.created_at AS shared_at,COALESCE(c.hidden,0) AS hidden,COALESCE(c.revision,0) AS revision ${source} WHERE ${clause} ORDER BY p.created_at DESC,f.id ASC LIMIT ? OFFSET ?`).bind(...args,pageSize,(page-1)*pageSize).all();
 console.log(JSON.stringify({module:'plaza_my_shares',event:'list_loaded',count:rows.results.length,page}));
 return sharesJson({total:count.total,page,pageSize,feeds:rows.results.map(row=>({id:row.id,title:row.title,url:row.url,icon:row.icon,category:row.category,status:isRssHubFeed(row.url)?'unknown':row.status,visibility:row.hidden?'hidden':row.published?'public':'pending',sharedAt:row.shared_at,revision:row.revision}))});
});}
export function deleteMyShare(context){return ownerRequest(context,async({request,env,params,user})=>{
 if(!/^[a-f0-9]{32}$/.test(params.id))throw new ShareError('not_found',404);
 const input=await readSmallJson(request);
 if(!input||!Number.isSafeInteger(input.revision)||input.revision<0||Object.keys(input).some(key=>key!=='revision'))throw new ShareError('invalid_input');
 const row=await env.DB.prepare(`SELECT f.id,COALESCE(c.revision,0) AS revision ${source} WHERE f.id=? AND p.user_id=? AND c.deleted_at IS NULL`).bind(params.id,user.id).first();
 if(!row)throw new ShareError('not_found',404);
 if(row.revision!==input.revision)throw new ShareError('conflict',409);
 if(!await quota(request,env,'my_share_delete',30,300))throw new ShareError('rate_limited',429);
 const operation=crypto.randomUUID().replaceAll('-',''),now=Date.now();
 // Stage one operation marker, snapshot counters, then remove all source data in
 // the same D1 transaction. Every write is gated by that marker and ownership.
 const guard='EXISTS (SELECT 1 FROM plaza_feed_controls c WHERE c.feed_id=? AND c.last_operation=?)';
 const result=await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO plaza_feed_controls (feed_id) SELECT feed_id FROM plaza_contributions WHERE feed_id=? AND user_id=?').bind(row.id,user.id),
  env.DB.prepare('UPDATE plaza_feed_controls SET revision=revision+1,last_operation=?,updated_at=? WHERE feed_id=? AND revision=? AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM plaza_contributions p WHERE p.feed_id=plaza_feed_controls.feed_id AND p.user_id=?)').bind(operation,now,row.id,row.revision,user.id),
  env.DB.prepare(`INSERT INTO plaza_usage_archive (feed_id,user_id,copy_count,import_count,deleted_at) SELECT f.id,p.user_id,COALESCE(s.copy_count,0),COALESCE(s.import_count,0),? FROM plaza_feeds f JOIN plaza_contributions p ON p.feed_id=f.id LEFT JOIN plaza_feed_stats s ON s.feed_id=f.id WHERE f.id=? AND p.user_id=? AND ${guard}`).bind(now,row.id,user.id,row.id,operation),
  env.DB.prepare('INSERT INTO plaza_share_audit (id,feed_id,actor_id,created_at) SELECT ?,feed_id,?,? FROM plaza_feed_controls WHERE feed_id=? AND last_operation=?').bind(operation,user.id,now,row.id,operation),
  env.DB.prepare(`DELETE FROM plaza_admin_audit WHERE feed_id=? AND ${guard}`).bind(row.id,row.id,operation),
  env.DB.prepare(`DELETE FROM plaza_classification WHERE feed_id=? AND ${guard}`).bind(row.id,row.id,operation),
  env.DB.prepare(`DELETE FROM plaza_feed_stats WHERE feed_id=? AND ${guard}`).bind(row.id,row.id,operation),
  env.DB.prepare(`DELETE FROM plaza_contributions WHERE feed_id=? AND ${guard}`).bind(row.id,row.id,operation),
  env.DB.prepare(`DELETE FROM plaza_feeds WHERE id=? AND ${guard}`).bind(row.id,row.id,operation),
  env.DB.prepare('DELETE FROM plaza_feed_controls WHERE feed_id=? AND last_operation=?').bind(row.id,operation),
 ]);
 if(!result[1].meta.changes)throw new ShareError('conflict',409);
 console.log(JSON.stringify({module:'plaza_my_shares',event:'share_deleted'}));
 return sharesJson({ok:true});
});}
