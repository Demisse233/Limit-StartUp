// Versioned, bounded rules: publisher identity beats incidental article keywords.
export const classificationVersion = 2;
const hosts = {
 technology: ['ithome.com','ifanr.com','huxiu.com','sspai.com','appinn.com','ghxi.com','iplaysoft.com','macrumors.com'],
 development: ['ruanyifeng.com','thenewstack.io','decohack.com'],
 gaming: ['yystv.cn','mihoyo.com','hoyoverse.com'],
 news: ['bbc.com','bbc.co.uk','reuters.com'],
};
const routes = {github:'development',sspai:'technology',ithome:'technology',ifanr:'technology',huxiu:'technology',appinn:'technology',yystv:'gaming',mihoyo:'gaming',hoyoverse:'gaming',arknights:'gaming',bbc:'news',reuters:'news'};
const patterns = {
 gaming: /游戏|原神|崩坏|明日方舟|绝区零|游研社|\b(?:games?|gaming|steam)\b/i,
 development: /开发|编程|程序员|代码|\b(?:github|javascript|python|coding|developers?|development|programming)\b/i,
 technology: /科技|数码|人工智能|软件|\b(?:apple|technology|tech|android|macrumors|ai|software)\b/i,
 news: /时事|国际新闻|社会新闻|\b(?:bbc|reuters|politics|world news)\b/i,
 culture: /文化|电影|音乐|艺术|书评|\b(?:movies?|music|culture|literature)\b/i,
 life: /生活|旅行|美食|摄影|\b(?:travel|food|life|lifestyle|photography)\b/i,
};
const plain = value => String(value ?? '').slice(0,4000).replace(/<[^>]*>/g,' ').replace(/https?:\/\/\S+/g,' ');
export function classifyEvidence(title, description='', url='', entries=[]) {
 try {
  const address=new URL(url), host=address.hostname.toLowerCase().replace(/\.$/,'');
  if(address.protocol==='rsshub:' && routes[host]) return {category:routes[host],source:'route'};
  // A shared API host carries several games; match its feed path, never all hosts indiscriminately.
  if(host==='news-api.amarea.cn' && /^\/news\/feed\/(?:genshin|zzz|hkrpg)\./.test(address.pathname))return {category:'gaming',source:'route'};
  for(const [category,domains] of Object.entries(hosts))if(domains.some(domain=>host===domain || host.endsWith('.'+domain)))return {category,source:'publisher'};
 } catch { /* Missing URL is supported by older callers. */ }
 const scores=Object.fromEntries(Object.keys(patterns).map(category=>[category,0]));
 for(const [category,pattern] of Object.entries(patterns)) {
  if(pattern.test(plain(title)))scores[category]+=4;
  if(pattern.test(plain(description)))scores[category]+=4;
  const recent=entries.slice(0,8).map(plain);
  const hits=recent.filter(entry=>pattern.test(entry)).length;
  // A single incidental article never decides a mixed personal feed's category.
  if(hits>=3 && hits/recent.length>=0.6)scores[category]+=3;
 }
 const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
 const [category,score]=ranked[0];
 return score>=3 && score-ranked[1][1]>=2 ? {category,source:'content'} : {category:'other',source:'uncertain'};
}
export function classify(title,description='',url='',entries=[]) {return classifyEvidence(title,description,url,entries).category;}
