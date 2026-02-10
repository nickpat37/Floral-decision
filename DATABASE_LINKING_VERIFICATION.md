# Database Linking Verification: Flowers and Questions

## ✅ Current Implementation Status

### How Flowers and Questions Are Linked

**YES, they are properly linked!** Here's how:

1. **Single Database Record**: Each flower record contains BOTH the question AND answer in the same row
2. **Linked by ID**: The `id` field serves as the primary key linking question and answer
3. **Same Timestamp**: Both question and answer share the same `timestamp` value

### Database Schema (Supabase)

The `flowers` table structure:
```sql
CREATE TABLE flowers (
    id BIGSERIAL PRIMARY KEY,           -- Unique ID linking question & answer
    question TEXT NOT NULL,              -- The user's question
    answer TEXT NOT NULL,                -- The answer from petal detachment
    num_petals INTEGER DEFAULT 20,      -- Number of petals
    petal_radius INTEGER DEFAULT 88,    -- Petal size
    disc_size INTEGER DEFAULT 120,      -- Disc size
    seed DOUBLE PRECISION,               -- Random seed for flower generation
    timestamp BIGINT NOT NULL,           -- When created (links Q&A)
    created_at TIMESTAMP DEFAULT NOW()  -- Database timestamp
);
```

### Data Flow

1. **Question Entry** (`question-page.js`):
   - User types question → stored in `window.currentQuestion`

2. **Answer Generation** (`script.js`):
   - User detaches petals → answer is calculated
   - `showAnswer(answer)` is called

3. **Saving to Database** (`script.js` → `database.js`):
   ```javascript
   // In showAnswer() method:
   this.saveFlowerToDatabase(window.currentQuestion, answer)
   
   // In saveFlowerToDatabase():
   await flowerDB.saveFlower({
       question: question,    // ← Question
       answer: answer,        // ← Answer
       numPetals: this.numPetals,
       petalRadius: this.petalRadius,
       discSize: this.discSize,
       seed: this.seed,
       timestamp: Date.now()
   })
   ```

4. **Database Storage** (`database.js`):
   ```javascript
   // Supabase insert (single row with both Q&A):
   const flower = {
       question: flowerData.question,  // ← Question
       answer: flowerData.answer,       // ← Answer
       num_petals: numPetals,
       petal_radius: petalRadius,
       disc_size: discSize,
       seed: seed,
       timestamp: timestamp,
       created_at: new Date().toISOString()
   };
   
   await supabaseClient.from('flowers').insert([flower])
   ```

### Verification Checklist

✅ **Question and Answer are in the same record**
- Both fields (`question` and `answer`) are saved together
- Same `id` links them
- Same `timestamp` links them

✅ **No separate tables needed**
- Not using a separate `questions` table
- Not using a separate `answers` table
- One-to-one relationship: 1 flower = 1 question + 1 answer

✅ **Retrieval maintains link**
- When loading flowers, both question and answer come together
- `getAllFlowers()` returns complete flower objects with both Q&A
- `getFlower(id)` returns a single flower with both Q&A

### Current Configuration Status

⚠️ **Supabase Anon Key**: Currently empty in `index.html` (line 105)
- This means the app is falling back to IndexedDB (local storage)
- To use Supabase, add your anon key to `index.html`

### Testing the Link

To verify flowers and questions are linked:

1. **Create a flower**:
   - Enter a question
   - Detach petals to get an answer
   - Check console: `✅ Flower saved to Supabase: [ID]`

2. **Check Supabase Dashboard**:
   - Go to Table Editor → `flowers`
   - Find your flower by ID
   - Verify both `question` and `answer` columns have data
   - They should be in the same row

3. **Check Garden Page**:
   - Navigate to Garden
   - Question bubbles should show the question
   - Each flower should have its question displayed

### Potential Issues to Check

1. **If question is missing**:
   - Check `window.currentQuestion` is set before `showAnswer()` is called
   - Verify question-page.js sets it correctly

2. **If answer is missing**:
   - Check that `showAnswer()` is called with a valid answer
   - Verify petal detachment logic is working

3. **If data isn't saving**:
   - Check Supabase anon key is configured
   - Check browser console for errors
   - Verify RLS policies allow INSERT

### Code Locations

- **Question storage**: `question-page.js` line 146 (`window.currentQuestion = question`)
- **Answer generation**: `script.js` line 1546 (`showAnswer(answer)`)
- **Saving**: `script.js` line 1747 (`saveFlowerToDatabase()`)
- **Database insert**: `database.js` line 105 (`saveFlower()`)
- **Supabase insert**: `database.js` line 127-135

## Conclusion

✅ **Flowers and questions ARE properly linked** - they're stored together in the same database record with the same ID and timestamp. The implementation is correct!
