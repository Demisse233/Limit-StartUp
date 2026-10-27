import {deleteMyShare,sharesJson} from '../../../_lib/plaza-my-shares.js';
export function onRequest(context){return context.request.method==='DELETE'?deleteMyShare(context):sharesJson({error:'method_not_allowed'},405);}
