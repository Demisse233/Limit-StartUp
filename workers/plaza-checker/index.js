import {checkFeed} from '../../functions/_lib/plaza.js';
export default {
 async scheduled(_controller,env,ctx){
  ctx.waitUntil((async()=>{
   const rows=await env.DB.prepare('SELECT * FROM plaza_feeds WHERE next_check<=? ORDER BY next_check LIMIT 5').bind(Date.now()).all();
   // Bounded batches preserve Worker subrequest budgets; each redirects at most 3 times.
   for(const row of rows.results)await checkFeed(row,env);
   await env.DB.prepare('DELETE FROM plaza_limits WHERE expires<?').bind(Date.now()).run();
  })());
 }
};
