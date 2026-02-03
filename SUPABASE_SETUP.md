# Supabase Setup Instructions

## Step 1: Get Your Supabase Anon Key

1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to **Settings** → **API**
4. Copy the **"anon public"** key (it's a long string starting with `eyJ...`)

## Step 2: Create Database Table

In your Supabase dashboard:

1. Go to **SQL Editor**
2. Click **New Query**
3. Paste this SQL:

```sql
-- Create flowers table
CREATE TABLE IF NOT EXISTS flowers (
    id BIGSERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    num_petals INTEGER DEFAULT 20,
    petal_radius INTEGER DEFAULT 88,
    disc_size INTEGER DEFAULT 120,
    seed DOUBLE PRECISION,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient queries (newest first)
CREATE INDEX IF NOT EXISTS idx_flowers_timestamp ON flowers(timestamp DESC);

-- Enable Row Level Security (optional - allows public read/write for now)
ALTER TABLE flowers ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access
CREATE POLICY "Allow public read access" ON flowers
    FOR SELECT
    USING (true);

-- Create policy to allow public insert access
CREATE POLICY "Allow public insert access" ON flowers
    FOR INSERT
    WITH CHECK (true);
```

4. Click **Run** to execute the SQL

## Step 3: Configure Supabase in Code

Once you have your anon key, share it with me and I'll update the code!

Your Supabase URL: `https://tjwasramaaxyelufbypw.supabase.co`
Your Anon Key: `[Paste it here]`

## Step 4: Test

After setup:
1. Create a question and get an answer
2. Check Supabase dashboard → Table Editor → flowers
3. You should see your flower data there
4. Open Garden page - it should load from Supabase

## Troubleshooting

**If you get CORS errors:**
- Make sure your Supabase project allows requests from your domain
- Check Settings → API → CORS settings

**If data doesn't save:**
- Check browser console for errors
- Verify RLS policies are set correctly
- Check that the table was created successfully
