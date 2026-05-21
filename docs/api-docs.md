# API Documentation

All routes are exposed through `api-gateway` on `http://localhost:8080`.

## Auth

- `POST /auth/register` with `{ "name": "...", "email": "...", "password": "..." }`
- `POST /auth/login` with `{ "email": "...", "password": "..." }`
- `GET /auth/me` with `Authorization: Bearer <jwt>`

## Sessions

- `POST /sessions/new` with `{ "url": "https://docs.example.com/page" }`
- `GET /sessions`
- `GET /sessions/{session_id}`
- `DELETE /sessions/{session_id}`

Each session is created with exactly one `doc_id` and `source_url`.

## Documents

- `POST /documents/validate-url` with `{ "url": "https://..." }`
- `POST /documents/ingest` with `{ "doc_id": "...", "session_id": "..." }`
- `GET /documents/{doc_id}/status`

Invalid URLs return:

```json
{ "error": "This URL does not appear to be a valid documentation or article page." }
```

## Chat

- `POST /chat` with `{ "session_id": "...", "question": "..." }`
- `GET /chat/{session_id}/messages`

The chat service retrieves only chunks matching the authenticated user, session, and document. Responses include source references:

```json
{
  "answer": "...",
  "sources": [
    {
      "doc_id": "...",
      "session_id": "...",
      "source_url": "https://...",
      "title": "...",
      "chunk_index": 3,
      "heading": "Configuration",
      "excerpt": "..."
    }
  ]
}
```
