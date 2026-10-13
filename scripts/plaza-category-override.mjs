// Generate reviewable SQL; this command never contacts or modifies the remote database.
import {categories} from '../functions/_lib/plaza.js';
const [id,category]=process.argv.slice(2);
if(!/^[a-f0-9]{32}$/.test(id ?? '') || ![...categories,'auto'].includes(category)) {
 console.error('Usage: node scripts/plaza-category-override.mjs <feed-id> <category|auto>');
 process.exit(1);
}
const value=category==='auto'?'NULL':`'${category}'`;
console.log(`INSERT INTO plaza_classification (feed_id,override_category,version,source,updated_at)
 SELECT id,${value},0,'manual',${Date.now()} FROM plaza_feeds WHERE id='${id}'
 ON CONFLICT(feed_id) DO UPDATE SET override_category=excluded.override_category,version=0,source='manual',updated_at=excluded.updated_at;
${category==='auto'?'':`UPDATE plaza_feeds SET category=(SELECT override_category FROM plaza_classification WHERE feed_id='${id}') WHERE id='${id}';`}`);
