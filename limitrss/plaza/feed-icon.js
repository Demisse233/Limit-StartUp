// Keep the same publisher-first fallback order as the app's FeedFavicon.
export function feedIconCandidates(feed) {
 const candidates=[];
 function add(value,base) {
  if(typeof value!=='string'||!value.trim())return;
  try {const url=new URL(value,base);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!candidates.includes(url.href))candidates.push(url.href);}catch{}
 }
 const base=feed.siteUrl||feed.url;add(feed.icon,base);
 let origin;try {const url=new URL(base);if(['http:','https:'].includes(url.protocol))origin=url.origin;}catch{}
 if(origin){
  for(const path of ['/apple-touch-icon.png','/favicon.png','/favicon.ico'])add(path,origin);
  const host=new URL(origin).hostname;
  add(`https://favicon.im/${host}?larger=true`);
  add(`https://icons.duckduckgo.com/ip3/${host}.ico`);
  add(`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(origin)}&sz=128`);
 }
 return candidates;
}
export function setFeedIcon(image,feed) {
 const candidates=feedIconCandidates(feed);
 let index=0;
 const next=()=>{
  if(index<candidates.length)image.src=candidates[index++];
  else {image.onerror=null;image.src=new URL('./feed-placeholder.svg',import.meta.url).href;}
 };
 image.onerror=next;next();
}
