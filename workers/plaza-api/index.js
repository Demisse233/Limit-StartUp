import {listPlazaFeeds} from '../../functions/_lib/plaza-directory.js';
import {onRequestGet as detail} from '../../functions/api/limitrss/plaza/[id].js';
import {onRequestPost as interaction} from '../../functions/api/limitrss/plaza/[id]/interaction.js';
import {respond} from '../../functions/_lib/plaza.js';
export default {
 async fetch(request,env) {
  const path=new URL(request.url).pathname;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
  if(path==='/api/limitrss/plaza/v1/feeds'&&request.method==='GET')return listPlazaFeeds({request,env});
  const match=path.match(/^\/api\/limitrss\/plaza\/v1\/feeds\/([a-f0-9]{32})(\/interaction)?$/);
  if(match){
   const context={request,env,params:{id:match[1]}};
   if(!match[2]&&request.method==='GET')return detail(context);
   if(match[2]&&request.method==='POST')return interaction(context);
   return respond({error:'method_not_allowed'},405);
  }
  return respond({error:'not_found'},404);
 }
};
