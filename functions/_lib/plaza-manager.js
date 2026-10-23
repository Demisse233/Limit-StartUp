import {getAuthUser} from './db.js';
import {categories,feedUrl,publicUrl,readSmallJson,checkFeed,isRssHubFeed} from './plaza.js';
import {categoryValue,languageValue} from './plaza-metadata.js';

import {isPlazaAdmin} from './plaza-access.js';
export const managerJson=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Vary':'Authorization'}});
class ManagerError extends Error {constructor(code,status=400){super(code);this.status=status;}}
async function admin(request,env) {
 const user=await getAuthUser(request,env);
 if(!user)throw new ManagerError('unauthorized',401);
 const account=await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(user.id).first();
 if(!account || !isPlazaAdmin(account.email,env))throw new ManagerError('forbidden',403);
 return user;
}
export async function managerRequest(context,handler) {
 const started=Date.now();
 try {
  const user=await admin(context.request,context.env);
  const result=await handler({...context,user});
  console.log(JSON.stringify({module:'plaza_manager',event:'request_succeeded',method:context.request.method,durationMs:Date.now()-started}));
  return result;
 }catch(error){
  const code=error instanceof ManagerError?error.message:/UNIQUE constraint failed/i.test(error.message)?'duplicate_url':'unavailable';
  const status=error instanceof ManagerError?error.status:code==='duplicate_url'?409:503;
  console.log(JSON.stringify({module:'plaza_manager',event:'request_failed',code,status,durationMs:Date.now()-started}));
  return managerJson({error:code},status);
 }
}
const source=`FROM plaza_feeds f LEFT JOIN plaza_feed_stats s ON s.feed_id=f.id LEFT JOIN plaza_feed_controls c ON c.feed_id=f.id`;
const fields=`f.*,s.language,COALESCE(s.copy_count,0) AS copy_count,COALESCE(s.import_count,0) AS import_count,COALESCE(c.hidden,0) AS hidden,c.deleted_at,COALESCE(c.revision,0) AS revision`;
export function listManaged(context){return managerRequest(context,async({request,env,user})=>{
 const query=new URL(request.url).searchParams,q=(query.get('q')??'').trim().slice(0,100),state=query.get('state'),category=query.get('category');
 const page=Math.max(1,Math.min(10000,parseInt(query.get('page'))||1));const where=[],args=[];
 if(q){where.push("(f.title LIKE ? ESCAPE '\\' OR f.url LIKE ? ESCAPE '\\')");const term='%'+q.replace(/[\\%_]/g,'\\$&')+'%';args.push(term,term);}
 if(categories.includes(category)){where.push('f.category=?');args.push(category);}
 if(state==='deleted')where.push('c.deleted_at IS NOT NULL');
 else if(state==='hidden')where.push('c.hidden=1 AND c.deleted_at IS NULL');
 else if(state==='public')where.push('f.published=1 AND COALESCE(c.hidden,0)=0 AND c.deleted_at IS NULL');
 else if(['pending','healthy','degraded','failed','unknown'].includes(state)){where.push('f.status=? AND c.deleted_at IS NULL');args.push(state);}
 const clause=where.length?' WHERE '+where.join(' AND '):'';
 const total=await env.DB.prepare(`SELECT COUNT(*) AS total ${source}${clause}`).bind(...args).first();
 const rows=await env.DB.prepare(`SELECT ${fields} ${source}${clause} ORDER BY f.created_at DESC,f.id LIMIT 30 OFFSET ?`).bind(...args,(page-1)*30).all();
 return managerJson({feeds:rows.results,total:total.total,page,pageSize:30,user:{email:user.email}});
});}
export function listAudit(context){return managerRequest(context,async({request,env})=>{
 const query=new URL(request.url).searchParams;const page=Math.max(1,Math.min(10000,parseInt(query.get('page'))||1));
 const rows=await env.DB.prepare('SELECT a.*,u.email AS actor FROM plaza_admin_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.id LIMIT 30 OFFSET ?').bind((page-1)*30).all();
 const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM plaza_admin_audit').first();
 return managerJson({entries:rows.results,page,pageSize:30,total:count.total});
});}
export function mutateManaged(context){return managerRequest(context,async({request,env,params,user})=>{
 if(!/^[a-f0-9]{32}$/.test(params.id))throw new ManagerError('not_found',404);
 const input=await readSmallJson(request);
 if(!input || !Number.isSafeInteger(input.revision) || input.revision<0)throw new ManagerError('invalid_input');
 const actions=['edit','hide','show','delete','restore'];
 if(!actions.includes(input.action))throw new ManagerError('invalid_action');
 const row=await env.DB.prepare(`SELECT ${fields} ${source} WHERE f.id=?`).bind(params.id).first();
 if(!row)throw new ManagerError('not_found',404);
 if(row.revision!==input.revision)throw new ManagerError('conflict',409);
 if(row.deleted_at && !['restore'].includes(input.action))throw new ManagerError('deleted',409);
 const patch={title:row.title,url:row.url,icon:row.icon,category:row.category,language:row.language??null};
 if(input.action==='edit') {
  if(typeof input.title!=='string' || !input.title.trim() || input.title.trim().length>200)throw new ManagerError('invalid_title');
  try {patch.title=input.title.trim();patch.url=feedUrl(input.url);patch.icon=input.icon?publicUrl(input.icon):null;patch.category=categoryValue(input.category);patch.language=languageValue(input.language);}
  catch(error){throw new ManagerError(['invalid_category','invalid_language'].includes(error.message)?error.message:'invalid_url');}
 }
 const now=Date.now(),operation=crypto.randomUUID().replaceAll('-','');
 const hidden=input.action==='hide'?1:input.action==='show'?0:input.action==='restore'?1:row.hidden;
 const deleted=input.action==='delete'?now:input.action==='restore'?null:row.deleted_at;
 const changedUrl=patch.url!==row.url,rsshub=patch.url.startsWith('rsshub://');
 const next={...patch,hidden,deleted_at:deleted,revision:row.revision+1};
 const match='EXISTS (SELECT 1 FROM plaza_feed_controls WHERE feed_id=? AND last_operation=?)';
 const writes=[
  env.DB.prepare('INSERT OR IGNORE INTO plaza_feed_controls (feed_id) SELECT id FROM plaza_feeds WHERE id=?').bind(row.id),
  env.DB.prepare('UPDATE plaza_feed_controls SET revision=revision+1,last_operation=?,hidden=?,deleted_at=?,language_locked=CASE WHEN ? THEN 1 ELSE language_locked END,updated_at=? WHERE feed_id=? AND revision=?').bind(operation,hidden,deleted,input.action==='edit'?1:0,now,row.id,row.revision),
  env.DB.prepare(`UPDATE plaza_feeds SET title=?,url=?,icon=?,category=?,status=?,published=?,failures=?,reason=?,checked_at=?,latency=?,next_check=? WHERE id=? AND ${match}`).bind(patch.title,patch.url,patch.icon,patch.category,changedUrl?(rsshub?'unknown':'pending'):row.status,changedUrl?(rsshub?1:0):row.published,changedUrl?0:row.failures,changedUrl?null:row.reason,changedUrl?null:row.checked_at,changedUrl?null:row.latency,changedUrl?(rsshub?0:now):row.next_check,row.id,row.id,operation),
 ];
 if(input.action==='edit')writes.push(
  env.DB.prepare(`INSERT INTO plaza_classification (feed_id,override_category,version,source,updated_at) SELECT id,?,0,'manual',? FROM plaza_feeds WHERE id=? AND ${match} ON CONFLICT(feed_id) DO UPDATE SET override_category=excluded.override_category,version=0,source='manual',updated_at=excluded.updated_at`).bind(patch.category,now,row.id,row.id,operation),
  env.DB.prepare(`INSERT INTO plaza_feed_stats (feed_id,language) SELECT id,? FROM plaza_feeds WHERE id=? AND ${match} ON CONFLICT(feed_id) DO UPDATE SET language=excluded.language`).bind(patch.language,row.id,row.id,operation),
 );
 writes.push(env.DB.prepare(`INSERT INTO plaza_admin_audit (id,feed_id,actor_id,action,before_json,after_json,created_at) SELECT ?,id,?,?,?,?,? FROM plaza_feeds WHERE id=? AND ${match}`).bind(operation,user.id,input.action,JSON.stringify(row),JSON.stringify(next),now,row.id,row.id,operation));
 const results=await env.DB.batch(writes);
 if(!results[1].meta.changes)throw new ManagerError('conflict',409);
 console.log(JSON.stringify({module:'plaza_manager',event:'feed_changed',id:row.id,actorId:user.id,action:input.action,revision:next.revision}));
 return managerJson({ok:true,revision:next.revision});
});}

export function recheckManaged(context,transport=fetch){return managerRequest(context,async({request,env,params,user})=>{
 const started=Date.now();
 if(!/^[a-f0-9]{32}$/.test(params.id))throw new ManagerError('not_found',404);
 const input=await readSmallJson(request);
 if(!input || !Number.isSafeInteger(input.revision) || input.revision<0)throw new ManagerError('invalid_input');
 const row=await env.DB.prepare(`SELECT ${fields} ${source} WHERE f.id=?`).bind(params.id).first();
 if(!row)throw new ManagerError('not_found',404);
 if(row.deleted_at)throw new ManagerError('deleted',409);
 if(row.revision!==input.revision)throw new ManagerError('conflict',409);
 if(isRssHubFeed(row.url))throw new ManagerError('unsupported_feed');
 console.log(JSON.stringify({module:'plaza_manager',event:'manual_check_started',id:row.id,actorId:user.id}));
 if(!await checkFeed(row,env,transport,{allowHidden:true}))throw new ManagerError('conflict',409);
 const result=await env.DB.prepare(`SELECT ${fields} ${source} WHERE f.id=?`).bind(row.id).first();
 if(result.revision!==row.revision || result.deleted_at)throw new ManagerError('conflict',409);
 console.log(JSON.stringify({module:'plaza_manager',event:'manual_check_completed',id:row.id,actorId:user.id,status:result.status,reason:result.reason,durationMs:Date.now()-started}));
 return managerJson({ok:true,status:result.status,reason:result.reason});
});}
