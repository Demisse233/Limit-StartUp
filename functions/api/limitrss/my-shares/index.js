import {listMyShares,sharesJson} from '../../../_lib/plaza-my-shares.js';
export function onRequest(context){return context.request.method==='GET'?listMyShares(context):sharesJson({error:'method_not_allowed'},405);}
