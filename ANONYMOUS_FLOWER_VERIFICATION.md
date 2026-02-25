# Anonymous Flower Save – Verification Checklist

This document verifies that anonymous users can save flowers and see them in the garden.

## Flow Summary

1. **User creates flower** (no sign-in) → types question, plucks petals, gets YES/NO
2. **Flower is saved** → Supabase (preferred) or IndexedDB/localStorage (fallback)
3. **User taps Done** → navigates to garden only after save succeeds
4. **Garden loads** → from Supabase + merges IndexedDB flower if missing

## Code Paths

| Step | File | Behavior |
|------|------|----------|
| Save | `database.js` | `getUser()` returns null for anonymous → no `user_id` in payload → Supabase INSERT works if RLS allows |
| Save fallback | `database.js` | If Supabase INSERT fails → IndexedDB → localStorage |
| Done button | `script.js` | Awaits `saveFlowerToDatabase()` → only navigates if `savedFlowerId` is truthy |
| Garden load | `garden-page.js` | `getAllFlowers()` from Supabase; if `lastCreatedFlowerId` not in results → `getFlower(id)` from IndexedDB/localStorage → prepend to list |

## Supabase Requirements

Run in SQL Editor if anonymous flowers fail to save or appear:

```sql
-- Allow anonymous INSERT (flowers with user_id = null)
DROP POLICY IF EXISTS "Allow authenticated insert flowers" ON flowers;
CREATE POLICY "Allow insert flowers (anonymous or authenticated)" ON flowers
    FOR INSERT
    WITH CHECK (true);

-- Allow anonymous SELECT (to see garden)
DROP POLICY IF EXISTS "Allow public read access" ON flowers;
CREATE POLICY "Allow public read access" ON flowers
    FOR SELECT
    USING (true);
```

## Fallback Chain

- **Save**: Supabase → IndexedDB → localStorage
- **Load (getAllFlowers)**: Supabase → IndexedDB → localStorage
- **Load single (getFlower)**: Supabase → IndexedDB → localStorage

IndexedDB is opened when Supabase is primary, so a failed Supabase INSERT can still use IndexedDB.

## Testing

1. Open app without signing in
2. Type a question, tap Done on question page
3. Pluck petals until answer appears
4. Tap Done on flower page
5. You should land on garden with your flower visible
