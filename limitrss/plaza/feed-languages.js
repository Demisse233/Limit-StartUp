// Shared by the management UI, public directory and upload validation.
export const feedLanguages = [
 ['zh-hans','简体中文','Simplified Chinese'],
 ['zh-hant','繁体中文','Traditional Chinese'],
 ['en','英语','English'],['ja','日语','Japanese'],['ko','韩语','Korean'],
 ['fr','法语','French'],['de','德语','German'],['es','西班牙语','Spanish'],
 ['pt','葡萄牙语','Portuguese'],['ru','俄语','Russian'],['it','意大利语','Italian'],
 ['ar','阿拉伯语','Arabic'],['hi','印地语','Hindi'],['id','印尼语','Indonesian'],
 ['vi','越南语','Vietnamese'],['th','泰语','Thai'],['und','其他语言','Other languages'],
];
export const feedLanguageCodes = feedLanguages.map(([code])=>code);
export function feedLanguageName(code,locale='zh') {
 const entry=feedLanguages.find(([value])=>value===code);
 return entry?entry[locale==='en'?2:1]:(code || (locale==='en'?'Unspecified':'未标注'));
}
