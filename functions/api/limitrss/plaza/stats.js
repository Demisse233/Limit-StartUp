import {respond} from '../../../_lib/plaza.js';
export async function onRequestGet({env}) {
 const started=Date.now();
 try {
  const contributors=await env.DB.prepare('SELECT COUNT(DISTINCT p.user_id) AS count FROM (SELECT user_id FROM plaza_contributions UNION SELECT user_id FROM plaza_usage_archive) p JOIN users u ON u.id=p.user_id').first();
  const feeds=await env.DB.prepare('SELECT COUNT(*) AS count FROM plaza_feeds f WHERE f.published=1 AND NOT EXISTS (SELECT 1 FROM plaza_feed_controls c WHERE c.feed_id=f.id AND (c.hidden=1 OR c.deleted_at IS NOT NULL))').first();
  const usage=await env.DB.prepare('SELECT COALESCE(SUM(copy_count+import_count),0) AS count FROM (SELECT copy_count,import_count FROM plaza_feed_stats UNION ALL SELECT copy_count,import_count FROM plaza_usage_archive)').first();
  console.log(JSON.stringify({module:'plaza',event:'community_stats_loaded',durationMs:Date.now()-started}));
  return respond({contributors:contributors.count,totalFeeds:feeds.count,totalUses:usage.count});
 }catch{console.log(JSON.stringify({module:'plaza',event:'community_stats_failed',durationMs:Date.now()-started}));return respond({error:'unavailable'},503);}
}
