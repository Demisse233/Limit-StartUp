import {respond,publicFeed} from '../../../_lib/plaza.js';
export async function onRequestGet({params,env}) {
 if(!/^[a-f0-9]{32}$/.test(params.id))return respond({error:'not_found'},404);
 try{const row=await env.DB.prepare('SELECT f.*,s.language,s.copy_count,s.import_count FROM plaza_feeds f LEFT JOIN plaza_feed_stats s ON s.feed_id=f.id WHERE f.id=? AND f.published=1').bind(params.id).first();return row?respond(publicFeed(row)):respond({error:'not_found'},404);}catch{return respond({error:'unavailable'},503);}
}
