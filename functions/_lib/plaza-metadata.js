import {feedLanguageCodes} from '../../limitrss/plaza/feed-languages.js';
import {categories} from './plaza.js';
export function categoryValue(value) {
 if(!categories.includes(value))throw new Error('invalid_category');
 return value;
}
export function languageValue(value) {
 if(value===null || value==='')return null;
 if(!feedLanguageCodes.includes(value))throw new Error('invalid_language');
 return value;
}
