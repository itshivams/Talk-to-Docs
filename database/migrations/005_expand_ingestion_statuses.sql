ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents
    ADD CONSTRAINT documents_status_check
    CHECK (status IN ('queued', 'processing', 'fetching', 'parsing', 'chunking', 'embedding', 'ready', 'error'));

ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_status_check;
ALTER TABLE chat_sessions
    ADD CONSTRAINT chat_sessions_status_check
    CHECK (status IN ('queued', 'processing', 'fetching', 'parsing', 'chunking', 'embedding', 'ready', 'error'));
