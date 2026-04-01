# Backend Next Steps

Ce repo ne contient que le frontend. Les changements ci-dessous correspondent exactement a ce que le frontend appelle deja.

## Priorite immediate

### 1. Messages: pagination reelle cote serveur

Route attendue:

```txt
GET /api/messages?room=burnout&limit=40&before=1711970400000&beforeId=msg_123
```

Regles:

- `room` est obligatoire.
- `limit` doit etre borne, par exemple entre `1` et `100`.
- `before` et `beforeId` servent a charger les messages plus anciens.
- La reponse doit etre un tableau de messages tries du plus ancien au plus recent.
- Si `before` n'est pas fourni, renvoyer seulement les derniers messages, pas tout l'historique.

Reponse recommandee:

```json
[
  {
    "id": "msg_123",
    "room": "burnout",
    "text": "Bonjour",
    "type": "text",
    "createdAt": "2026-04-01T10:15:00.000Z",
    "updatedAt": "2026-04-01T10:15:00.000Z",
    "editedAt": null,
    "sender": {
      "id": "user_1",
      "name": "Ericka",
      "avatar": "/uploads/avatar-1.jpg"
    }
  }
]
```

Exemple logique SQL Postgres:

```sql
-- Derniers messages d'un salon
SELECT
  m.id,
  m.room,
  m.content AS text,
  'text' AS type,
  m.created_at AS "createdAt",
  m.updated_at AS "updatedAt",
  m.edited_at AS "editedAt",
  json_build_object(
    'id', u.id,
    'name', COALESCE(u.username, m.username, 'Utilisateur'),
    'avatar', u.avatar
  ) AS sender
FROM messages m
LEFT JOIN users u ON u.id = m.user_id
WHERE m.room = $1
  AND m.deleted_at IS NULL
ORDER BY m.created_at DESC, m.id DESC
LIMIT $2;
```

```sql
-- Messages plus anciens
SELECT
  m.id,
  m.room,
  m.content AS text,
  'text' AS type,
  m.created_at AS "createdAt",
  m.updated_at AS "updatedAt",
  m.edited_at AS "editedAt",
  json_build_object(
    'id', u.id,
    'name', COALESCE(u.username, m.username, 'Utilisateur'),
    'avatar', u.avatar
  ) AS sender
FROM messages m
LEFT JOIN users u ON u.id = m.user_id
WHERE m.room = $1
  AND m.deleted_at IS NULL
  AND (
    m.created_at < to_timestamp($3 / 1000.0)
    OR (
      m.created_at = to_timestamp($3 / 1000.0)
      AND m.id < $4
    )
  )
ORDER BY m.created_at DESC, m.id DESC
LIMIT $2;
```

Puis inverser le resultat en code avant `res.json(...)` pour garder un ordre chronologique.

Exemple Express:

```ts
router.get("/api/messages", async (req, res) => {
  const room = String(req.query.room || "").trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
  const before = req.query.before ? Number(req.query.before) : null;
  const beforeId = String(req.query.beforeId || "").trim();

  if (!room) {
    return res.status(400).json({ error: "room_required" });
  }

  const rows = before && beforeId
    ? await db.query(OLDER_MESSAGES_SQL, [room, limit, before, beforeId])
    : await db.query(LATEST_MESSAGES_SQL, [room, limit]);

  return res.json(rows.rows.reverse());
});
```

### 2. Stories: pagination reelle cote serveur

Route attendue:

```txt
GET /api/stories?page=1&limit=48&q=burnout&tag=solitude&author=user_1
```

Regles:

- `page` commence a `1`.
- `limit` doit etre borne, par exemple entre `1` et `100`.
- `q` filtre sur `title` et `body`.
- `tag` filtre sur les tags.
- `author` filtre sur l'auteur.
- La reponse actuelle du frontend attend simplement un tableau.

Reponse recommandee:

```json
[
  {
    "id": "story_1",
    "title": "A bout de souffle",
    "body": "Je suis actuellement...",
    "tags": ["burnout"],
    "user_id": "user_1",
    "author_avatar": "/uploads/avatar-1.jpg",
    "likes": 4,
    "liked_by_me": true
  }
]
```

Exemple logique SQL Postgres:

```sql
SELECT
  s.id,
  s.title,
  s.body,
  s.tags,
  s.user_id,
  u.avatar AS author_avatar,
  COUNT(sl.user_id)::int AS likes,
  BOOL_OR(sl.user_id = $1) AS liked_by_me
FROM stories s
LEFT JOIN users u ON u.id = s.user_id
LEFT JOIN story_likes sl ON sl.story_id = s.id
WHERE s.published = true
  AND ($2::text IS NULL OR s.user_id = $2)
  AND ($3::text IS NULL OR $3 = ANY(s.tags))
  AND (
    $4::text IS NULL
    OR s.title ILIKE '%' || $4 || '%'
    OR s.body ILIKE '%' || $4 || '%'
  )
GROUP BY s.id, u.avatar
ORDER BY s.published_at DESC NULLS LAST, s.created_at DESC, s.id DESC
LIMIT $5 OFFSET $6;
```

Exemple Express:

```ts
router.get("/api/stories", authOptional, async (req, res) => {
  const userId = req.user?.id ?? null;
  const author = String(req.query.author || "").trim() || null;
  const tag = String(req.query.tag || "").trim() || null;
  const q = String(req.query.q || "").trim() || null;
  const limit = Math.min(Math.max(Number(req.query.limit) || 48, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * limit;

  const rows = await db.query(STORIES_SQL, [
    userId,
    author,
    tag,
    q,
    limit,
    offset,
  ]);

  return res.json(rows.rows);
});
```

### 3. Brouillons et publication

Le frontend utilise deja ces routes:

```txt
POST /api/mystory
GET /api/mystory/drafts
GET /api/mystory/me
DELETE /api/mystory/:id
PUT /api/mystory/:id/publish
```

Comportement attendu:

- `POST /api/mystory` doit creer ou mettre a jour un brouillon.
- La reponse doit contenir l'id du brouillon dans `id`, `_id`, `draft.id`, `story.id` ou `data.id`.
- `PUT /api/mystory/:id/publish` doit marquer le brouillon comme publie.
- Une story publiee doit ensuite ressortir dans `GET /api/stories`.

Body attendu pour `POST /api/mystory`:

```json
{
  "id": "draft_1",
  "title": "Mon histoire",
  "body": "Contenu...",
  "tags": ["burnout"]
}
```

## Endpoints deja relies au frontend

### Messages

```txt
GET    /api/messages
POST   /api/messages
PATCH  /api/messages/:id
PUT    /api/messages/:id
DELETE /api/messages/:id
POST   /api/translate
```

Body attendu pour `POST /api/messages`:

```json
{
  "room": "burnout",
  "userId": "user_1",
  "username": "Ericka",
  "content": "Bonjour"
}
```

Body attendu pour `PATCH` ou `PUT /api/messages/:id`:

```json
{
  "room": "burnout",
  "userId": "user_1",
  "content": "Message modifie",
  "text": "Message modifie"
}
```

### Stories

```txt
GET    /api/stories
POST   /api/stories/:id/like
DELETE /api/stories/:id/unlike
DELETE /api/stories/:id
```

## Index indispensables

Messages:

```sql
CREATE INDEX IF NOT EXISTS idx_messages_room_created_id
ON messages (room, created_at DESC, id DESC)
WHERE deleted_at IS NULL;
```

Stories:

```sql
CREATE INDEX IF NOT EXISTS idx_stories_published_created
ON stories (published, published_at DESC, created_at DESC, id DESC);
```

```sql
CREATE INDEX IF NOT EXISTS idx_stories_user_created
ON stories (user_id, published_at DESC, created_at DESC, id DESC);
```

Likes:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_story_likes_unique
ON story_likes (story_id, user_id);
```

Recherche texte si tu es sur Postgres:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_stories_title_trgm
ON stories USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_stories_body_trgm
ON stories USING gin (body gin_trgm_ops);
```

## Rate limiting

Je te conseille au minimum:

- `POST /api/messages`: 10 a 20 messages par 10 secondes par utilisateur.
- `POST /api/stories/:id/like`: 20 actions par minute.
- `POST /api/mystory` et `PUT /api/mystory/:id/publish`: 10 actions par heure.

## Socket.io

Le frontend ecoute deja ces evenements:

```txt
message-created
new-message
room-message
chat-message
message
message-updated
edited-message
update-message
message-deleted
removed-message
delete-message
typing
typing-start
typing-stop
typing-status
user-typing
online-count
```

Le plus simple cote backend:

- garder seulement un nom principal par type d'evenement
- continuer a emettre les alias existants tant que le frontend historique existe

Payload message recommande:

```json
{
  "id": "msg_123",
  "room": "burnout",
  "text": "Bonjour",
  "createdAt": "2026-04-01T10:15:00.000Z",
  "sender": {
    "id": "user_1",
    "name": "Ericka",
    "avatar": "/uploads/avatar-1.jpg"
  }
}
```

Payload typing recommande:

```json
{
  "room": "burnout",
  "userId": "user_1",
  "name": "Ericka",
  "isTyping": true
}
```

## Ordre de travail conseille

1. Corriger `GET /api/messages` avec `limit` et `before`.
2. Corriger `GET /api/stories` avec `page` et `limit`.
3. Ajouter les index SQL.
4. Ajouter le rate limiting.
5. Si plusieurs instances backend plus tard, brancher Redis pour Socket.io.

## Important

Si ton backend continue a renvoyer toute la table `messages` ou toute la table `stories`, le frontend restera plus leger qu'avant, mais le serveur ne passera pas a l'echelle proprement.
