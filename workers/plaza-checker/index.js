import {checkFeed} from '../../functions/_lib/plaza.js';
export default {
 async scheduled(_controller,env,ctx){
  ctx.waitUntil((async()=>{
   // Clear legacy instance-specific results and publish valid public RSSHub routes.
   await env.DB.prepare("UPDATE plaza_feeds SET status='unknown',reason=NULL,failures=0,published=1,checked_at=NULL,next_check=0,latency=NULL WHERE lower(url) LIKE 'rsshub://%' AND (status!='unknown' OR published!=1 OR checked_at IS NOT NULL OR latency IS NOT NULL OR failures!=0 OR reason IS NOT NULL)").run();
   const rows=await env.DB.prepare("SELECT * FROM plaza_feeds WHERE lower(url) NOT LIKE 'rsshub://%' AND next_check<=? ORDER BY next_check LIMIT 5").bind(Date.now()).all();
   // Bounded batches preserve Worker subrequest budgets; each redirects at most 3 times.
   for(const row of rows.results)await checkFeed(row,env);
   await env.DB.prepare('DELETE FROM plaza_limits WHERE expires<?').bind(Date.now()).run();
  })());
 }
};
