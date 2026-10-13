import {classificationVersion} from '../../functions/_lib/plaza-classification.js';
import {checkFeed} from '../../functions/_lib/plaza.js';
export default {
 async scheduled(_controller,env,ctx){
  ctx.waitUntil((async()=>{
   // Clear legacy instance-specific results and publish valid public RSSHub routes.
   await env.DB.prepare("UPDATE plaza_feeds SET status='unknown',reason=NULL,failures=0,published=1,checked_at=NULL,next_check=0,latency=NULL WHERE NOT EXISTS (SELECT 1 FROM plaza_feed_controls c WHERE c.feed_id=plaza_feeds.id AND (c.hidden=1 OR c.deleted_at IS NOT NULL)) AND lower(url) LIKE 'rsshub://%' AND (status!='unknown' OR published!=1 OR checked_at IS NOT NULL OR latency IS NOT NULL OR failures!=0 OR reason IS NOT NULL)").run();
   const rows=await env.DB.prepare("SELECT f.* FROM plaza_feeds f LEFT JOIN plaza_classification c ON c.feed_id=f.id WHERE NOT EXISTS (SELECT 1 FROM plaza_feed_controls m WHERE m.feed_id=f.id AND (m.hidden=1 OR m.deleted_at IS NOT NULL)) AND (COALESCE(c.version,0)<? OR (lower(f.url) NOT LIKE 'rsshub://%' AND f.next_check<=?)) ORDER BY COALESCE(c.version,0),f.next_check LIMIT 5").bind(classificationVersion,Date.now()).all();
   // Bounded batches preserve Worker subrequest budgets; each redirects at most 3 times.
   for(const row of rows.results)await checkFeed(row,env);
   await env.DB.prepare('DELETE FROM plaza_limits WHERE expires<?').bind(Date.now()).run();
  })());
 }
};
