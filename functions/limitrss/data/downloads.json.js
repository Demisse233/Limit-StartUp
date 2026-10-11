import {manifestResponse, optionsResponse} from '../../_lib/downloads.js';
export const onRequestGet = manifestResponse;
export const onRequestHead = manifestResponse;
export const onRequestOptions = optionsResponse;
