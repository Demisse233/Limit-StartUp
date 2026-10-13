import {categories} from './plaza.js';
export function categoryValue(value) {
 if(!categories.includes(value))throw new Error('invalid_category');
 return value;
}
export function languageValue(value) {
 if(value===null || value==='')return null;
 if(typeof value!=='string' || value.length>48 || !/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i.test(value))throw new Error('invalid_language');
 return value.replaceAll('_','-').toLowerCase();
}
