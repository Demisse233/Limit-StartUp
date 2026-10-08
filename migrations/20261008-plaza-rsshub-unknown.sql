-- RSSHub availability depends on the chosen instance, so old checks are not authoritative.
UPDATE plaza_feeds SET status='unknown',reason=NULL,failures=0,published=1,checked_at=NULL,next_check=0,latency=NULL WHERE lower(url) LIKE 'rsshub://%';
