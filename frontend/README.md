# Talk to Docs Frontend

Next.js Pages Router frontend for the Talk to Docs app.

## Routes

- `/login`
- `/register`
- `/dashboard`
- `/chat/[sessionId]`

## Development

```bash
npm install
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 npm run dev
```

The UI talks only to the Go API gateway. Auth state is stored as a JWT in local storage and SWR is used for protected session/chat data.
