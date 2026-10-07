import {respond,publicFeed,categories} from './plaza.js';
const statuses=['healthy','degraded','failed'];
export async function listPlazaFeeds({request,env}) {
 const started=Date.now();
 try {
  const query=new URL(request.url).searchParams;
  const q=(query.get('q')??'').trim().slice(0,100),category=query.get('category'),status=query.get('status'),language=query.get('language');
  const page=Math.max(1,Math.min(10000,parseInt(query.get('page'))||1));
  const where=['published=1'],args=[];
  if(q){where.push('(title LIKE ? ESCAPE \'\\\' OR url LIKE ? ESCAPE \'\\\')');const term=`%${q.replace(/[\\%_]/g,'\\$&')}%`;args.push(term,term);}
  if(categories.includes(category)){where.push('category=?');args.push(category);}
  if(statuses.includes(status)){where.push('status=?');args.push(status);}
  if(language==='unknown')where.push('(language IS NULL OR language=\'\')');
  else if(language && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language)){
   where.push('(lower(language)=? OR lower(language) LIKE ?)');args.push(language.toLowerCase(),language.toLowerCase()+'-%');
  }
  const source='(SELECT f.*,s.language,COALESCE(s.copy_count,0) AS copy_count,COALESCE(s.import_count,0) AS import_count FROM plaza_feeds f LEFT JOIN plaza_feed_stats s ON s.feed_id=f.id)';
  const clause=where.join(' AND ');
  const sorts={popularity:'(copy_count+import_count) DESC,created_at DESC,id ASC',newest:'created_at DESC,id ASC',name:'title COLLATE NOCASE ASC,created_at DESC,id ASC'};
  const sort=Object.hasOwn(sorts,query.get('sort'))?query.get('sort'):'popularity';
  const total=await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${source} WHERE ${clause}`).bind(...args).first();
  const rows=await env.DB.prepare(`SELECT * FROM ${source} WHERE ${clause} ORDER BY ${sorts[sort]} LIMIT 30 OFFSET ?`).bind(...args,(page-1)*30).all();
  const languages=await env.DB.prepare('SELECT DISTINCT lower(s.language) AS language FROM plaza_feeds f JOIN plaza_feed_stats s ON s.feed_id=f.id WHERE f.published=1 AND s.language IS NOT NULL ORDER BY language').all();
  console.log(JSON.stringify({module:'plaza',event:'directory_loaded',page,count:rows.results.length,durationMs:Date.now()-started}));
  return respond({schemaVersion:1,total:total.total,page,pageSize:30,sort,filters:{categories,statuses,languages:languages.results.map(row=>row.language)},feeds:rows.results.map(publicFeed)});
 }catch(error){
  console.log(JSON.stringify({module:'plaza',event:'directory_failed',errorType:error?.name,durationMs:Date.now()-started}));
  return respond({error:'unavailable'},503);
 }
}
