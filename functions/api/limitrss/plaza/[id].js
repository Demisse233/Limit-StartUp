import {respond,publicFeed} from '../../../_lib/plaza.js';
export async function onRequestGet({params,env}) {
 if(!/^[a-f0-9]{32}$/.test(params.id))return respond({error:'not_found'},404);
 try{const row=await env.DB.prepare('SELECT * FROM plaza_feeds WHERE id=? AND published=1').bind(params.id).first();return row?respond(publicFeed(row)):respond({error:'not_found'},404);}catch{return respond({error:'unavailable'},503);}
}
