# Supabase Auth Setup – User Sign-Up for Comments and Flowers

This guide adds user authentication so users must sign up to comment and to link their flowers to their account.

---

## Overview

| Component | Purpose |
|-----------|---------|
| **Supabase Auth** | Built-in sign-up/sign-in (no custom users table) |
| **profiles** | Display name, avatar seed – linked to auth.users |
| **comments** | Add `user_id` → links each comment to the signed-in user |
| **flowers** | Add `user_id` → links each flower to its creator |

---

## Step 1: Enable Supabase Auth

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → your project
2. **Authentication** → **Providers**
3. Enable **Email** (and optionally **Google**, **Apple**, etc.)

---

## Step 2: Run the Migration SQL

In **SQL Editor** → **New query**, run:

```sql
-- ============================================
-- 1. Profiles table (display name, avatar for each user)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL DEFAULT 'Anonymous',
    avatar_seed TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Automatically create profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, avatar_seed)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'display_name', COALESCE(NEW.email, 'User')),
        COALESCE(NEW.raw_user_meta_data->>'avatar_seed', substring(NEW.id::text, 1, 8))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. Add user_id to flowers (nullable for existing rows)
-- ============================================
ALTER TABLE flowers
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_flowers_user_id ON flowers(user_id);

-- ============================================
-- 3. Add user_id to comments (required for new comments)
-- ============================================
ALTER TABLE comments
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);

-- Drop old permissive policies (we'll replace them)
DROP POLICY IF EXISTS "Allow public insert comments" ON comments;
DROP POLICY IF EXISTS "Allow public insert access" ON flowers;

-- ============================================
-- 4. RLS Policies (auth required for insert)
-- ============================================

-- Profiles: users can read all, update only their own
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone" ON profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Flowers: read all, insert allowed for both anonymous and signed-in users
-- Anonymous flowers have user_id = null; signed-in flowers have user_id = auth.uid()
CREATE POLICY "Allow insert flowers (anonymous or authenticated)" ON flowers
    FOR INSERT
    WITH CHECK (true);

-- Flowers: allow update if you need it (e.g. user edits their flower)
-- For now we keep it read-only; add UPDATE policy if needed

-- Comments: read all, insert only when signed in
CREATE POLICY "Allow authenticated insert comments" ON comments
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Comments: update for like_count (anyone can increment)
-- Keep existing "Allow public update comments" or restrict to own row if desired
```

---

## Step 3: Enable Sign-Up UI in Your App

You need:

1. **Sign-up form** – email + password (and optionally display name)
2. **Sign-in form** – email + password
3. **Session handling** – get current user and sign-out

---

## Data Flow

| Action | Data stored |
|--------|-------------|
| User signs up | `auth.users` (Supabase) + `profiles` (display_name, avatar_seed) |
| User creates flower | `flowers.user_id` = `auth.uid()` |
| User comments | `comments.user_id` = `auth.uid()`, `author_name` from `profiles.display_name` |

---

## Schema Summary

```
auth.users (Supabase managed)
├── id (UUID)
├── email
├── ...
└── raw_user_meta_data (display_name, avatar_seed at sign-up)

profiles
├── id (UUID, FK → auth.users)
├── display_name
├── avatar_seed
└── updated_at

flowers
├── ... existing columns ...
└── user_id (UUID, FK → auth.users)  -- who created this flower

comments
├── ... existing columns ...
└── user_id (UUID, FK → auth.users)  -- who wrote this comment
```

---

## Migration: Allow Anonymous Flowers (if you already ran the original)

If you previously ran the auth setup and want anonymous flower creation, run this in SQL Editor:

```sql
DROP POLICY IF EXISTS "Allow authenticated insert flowers" ON flowers;
CREATE POLICY "Allow insert flowers (anonymous or authenticated)" ON flowers
    FOR INSERT
    WITH CHECK (true);
```

## Migration: Ensure Anonymous Users Can See Flowers in Garden

Anonymous users must be able to SELECT from `flowers` to see the garden. Run this if anonymous users don't see flowers:

```sql
-- Allow anyone (including anonymous) to read all flowers
CREATE POLICY "Allow public read access" ON flowers
    FOR SELECT
    USING (true);
```

If you get "policy already exists", the policy is fine. To replace: `DROP POLICY IF EXISTS "Allow public read access" ON flowers;` then run the CREATE above.

---

## Next Steps

1. Run the SQL above in Supabase
2. Add sign-up / sign-in UI (modal or page)
3. Update `database.js` and `garden-page.js` to use the logged-in user when saving flowers and comments
4. Pass `user_id` and `display_name` from the session into `saveComment` and `saveFlower`
