# Supabase Comments Setup Guide

This guide walks you through setting up the comment section database in Supabase, step by step.

---

## Schema Overview

We'll create two tables:

| Table | Purpose |
|-------|---------|
| **comments** | Stores comment text, author, and metadata. Links to flowers via `flower_id`. |
| **comment_likes** | Tracks likes per comment. Optional for MVP—you can start with just `like_count` on comments. |

### Data to Store

| Field | Type | Description |
|-------|------|-------------|
| **comments** | | |
| `id` | BIGSERIAL | Primary key (auto-generated) |
| `flower_id` | BIGINT | References `flowers.id`—which flower this comment belongs to |
| `author_name` | TEXT | Display name (e.g., "Alex Chen") |
| `author_avatar_seed` | TEXT | Seed for DiceBear avatar URL (e.g., "Alex" → `?seed=Alex`) |
| `text` | TEXT | Comment content |
| `like_count` | INTEGER | Number of likes (default 0) |
| `parent_id` | BIGINT | Optional—for replies; references `comments.id` |
| `created_at` | TIMESTAMPTZ | When the comment was created |

---

## Step 1: Open Supabase SQL Editor

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project (the one you use for flowers)
3. In the left sidebar, click **SQL Editor**
4. Click **New query**

---

## Step 2: Run the Migration SQL

Copy and paste this SQL, then click **Run**:

```sql
-- ============================================
-- Comments table
-- ============================================
CREATE TABLE IF NOT EXISTS comments (
    id BIGSERIAL PRIMARY KEY,
    flower_id BIGINT NOT NULL REFERENCES flowers(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    author_avatar_seed TEXT,
    text TEXT NOT NULL,
    like_count INTEGER DEFAULT 0,
    parent_id BIGINT REFERENCES comments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fetching comments by flower (most common query)
CREATE INDEX IF NOT EXISTS idx_comments_flower_id ON comments(flower_id);

-- Index for ordering by newest first
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);

-- Index for replies (fetching children of a comment)
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id) WHERE parent_id IS NOT NULL;

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read comments
CREATE POLICY "Allow public read comments" ON comments
    FOR SELECT
    USING (true);

-- Allow anyone to insert comments
CREATE POLICY "Allow public insert comments" ON comments
    FOR INSERT
    WITH CHECK (true);

-- Allow anyone to update (for like_count)
CREATE POLICY "Allow public update comments" ON comments
    FOR UPDATE
    USING (true)
    WITH CHECK (true);
```

---

## Step 3: Verify the Table

1. In the left sidebar, click **Table Editor**
2. You should see **comments** in the list
3. Click **comments** and confirm the columns: `id`, `flower_id`, `author_name`, `author_avatar_seed`, `text`, `like_count`, `parent_id`, `created_at`

---

## Step 4: Add Sample Data (Optional)

To test, you can insert a few comments. First, find a valid `flower_id` from your flowers table:

```sql
-- See existing flower IDs
SELECT id, question FROM flowers LIMIT 5;
```

Then insert a comment (replace `YOUR_FLOWER_ID` with a real id, e.g. `1`):

```sql
INSERT INTO comments (flower_id, author_name, author_avatar_seed, text)
VALUES 
    (YOUR_FLOWER_ID, 'Alex Chen', 'Alex', 'Loved this lesson! The examples were clear.'),
    (YOUR_FLOWER_ID, 'Jordan Kim', 'Jordan', 'Great question! I had the same thought.');
```

---

## Step 5: Wire Up Your App

Your app already has:

- `window.SUPABASE_URL` and `window.SUPABASE_ANON_KEY` set (from `index.html` or config)
- `database.js` with `FlowerDatabase` and Supabase client

Next, add comment-related methods to `database.js` and call them from `garden-page.js` when:

1. **Loading comments**: When the user taps a flower → fetch comments for that `flower_id`
2. **Submitting a comment**: When the user submits → insert into `comments`
3. **Liking**: When the user clicks Like → `UPDATE comments SET like_count = like_count + 1 WHERE id = ?`

I can provide the exact JavaScript code for these if you want.

---

## Optional: Comment Likes Table (For Auth Later)

When you add user authentication, you can switch from `like_count` to a proper likes table so users can unlike:

```sql
CREATE TABLE comment_likes (
    comment_id BIGINT REFERENCES comments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    PRIMARY KEY (comment_id, user_id)
);
```

For now, `like_count` on the comments table is simpler and works without auth.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `relation "flowers" does not exist` | Run your flowers table creation first (see SUPABASE_SETUP.md) |
| `permission denied for table comments` | Ensure RLS policies were created (re-run the policy SQL) |
| Comments don't load | Check that `flower_id` exists in `flowers`; verify Supabase URL and anon key |
| CORS errors | In Supabase: Settings → API → add your site URL to allowed origins |
