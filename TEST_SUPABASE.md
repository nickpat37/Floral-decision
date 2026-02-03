# Testing Supabase Integration

## ✅ Setup Complete!

Your Supabase integration is now configured. Here's how to test it:

## Quick Test Steps

1. **Open your app** in a browser
2. **Open Browser Console** (F12 or Cmd+Option+I)
3. **Look for these messages:**
   - `✅ Using Supabase for storage` - Supabase is connected
   - `📊 Supabase connection successful. Current flowers: X` - Connection test passed

## Test the Flow

### 1. Create a Question
- Type a question in the input field
- Click "Done" or press Enter
- Detach petals until you get an answer
- **Check console** - you should see: `✅ Flower saved to Supabase: [ID]`

### 2. Verify in Supabase Dashboard
- Go to https://supabase.com/dashboard
- Select your project
- Go to **Table Editor** → **flowers**
- You should see your flower data there!

### 3. Test Garden Page
- Click the **"🌸 Garden"** button
- **Check console** - you should see: `📖 Loaded X flowers from Supabase`
- Scroll down to test lazy loading
- Question bubbles should appear for flowers in the center

## Troubleshooting

### If you see "Supabase anon key not set"
- Check `index.html` line 105 - make sure the anon key is there
- The key should start with `eyJ...`

### If you see "Supabase save error"
- Check browser console for the full error message
- Verify the table was created correctly in Supabase
- Check that RLS policies allow INSERT

### If flowers aren't loading in Garden
- Check console for errors
- Verify Supabase connection (look for ✅ messages)
- Check Supabase dashboard → Table Editor to see if data exists

### If you see "falling back to IndexedDB"
- This means Supabase isn't working, but the app still works locally
- Check your Supabase URL and anon key
- Verify the table exists and has correct schema

## Expected Console Output

When everything works, you should see:
```
✅ Using Supabase for storage
📊 Supabase connection successful. Current flowers: 0
✅ Flower saved to Supabase: 1234567890
📖 Loaded 1 flowers from Supabase (offset: 0, limit: 20)
```

## Database Schema Check

Make sure your `flowers` table has these columns:
- `id` (BIGSERIAL PRIMARY KEY)
- `question` (TEXT)
- `answer` (TEXT)
- `num_petals` (INTEGER)
- `petal_radius` (INTEGER)
- `disc_size` (INTEGER)
- `seed` (DOUBLE PRECISION)
- `timestamp` (BIGINT)
- `created_at` (TIMESTAMP)

## Success Indicators

✅ Console shows "Using Supabase for storage"  
✅ Flowers save successfully  
✅ Garden page loads flowers from Supabase  
✅ Multiple users can see each other's flowers  

If all these work, your Supabase integration is complete! 🎉
