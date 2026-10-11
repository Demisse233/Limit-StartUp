import {downloadResponse, optionsResponse} from '../../../_lib/downloads.js';
export const onRequestGet = context => downloadResponse(context, context.params.file.replace(/\.json$/, ''));
export const onRequestHead = onRequestGet;
export const onRequestOptions = optionsResponse;
