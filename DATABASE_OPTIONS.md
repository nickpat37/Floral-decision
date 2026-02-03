# Database Options for Garden Page

## Overview
The Garden page displays all flowers (questions) ever created. You need a database to store and retrieve this data. Below are the recommended options, ordered by complexity and features.

## Current Implementation
✅ **IndexedDB (Client-Side) - IMPLEMENTED**
- Works immediately, no setup required
- Stores data locally in browser
- Good for single-user, offline-first apps
- **Limitation**: Data is per-device only, not shared across users

## Recommended Options for Multi-User

### 1. Supabase (Recommended) ⭐
**Best for**: Multi-user, real-time updates, production apps

**Pros:**
- Free tier: 500MB database, 2GB bandwidth
- Real-time subscriptions
- Built-in authentication
- PostgreSQL database
- Easy REST API
- Row-level security

**Setup Steps:**
1. Go to https://supabase.com
2. Create free account
3. Create new project
4. Get API URL and anon key from Settings > API
5. Update `database.js` to add Supabase client:

```javascript
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseKey = 'YOUR_ANON_KEY'
const supabase = createClient(supabaseUrl, supabaseKey)

// Add to FlowerDatabase class:
async saveFlower(flowerData) {
    const { data, error } = await supabase
        .from('flowers')
        .insert([flowerData])
    return data?.[0]?.id
}

async getAllFlowers(options) {
    const { data, error } = await supabase
        .from('flowers')
        .select('*')
        .order('timestamp', { ascending: false })
        .range(options.offset, options.offset + options.limit - 1)
    return data || []
}
```

**Database Schema:**
```sql
CREATE TABLE flowers (
    id BIGSERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    num_petals INTEGER,
    petal_radius INTEGER,
    disc_size INTEGER,
    seed FLOAT,
    timestamp BIGINT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_timestamp ON flowers(timestamp DESC);
```

---

### 2. Firebase Firestore
**Best for**: Google ecosystem, real-time features

**Pros:**
- Free tier: 1GB storage, 10GB/month transfer
- Real-time updates
- Google authentication
- NoSQL database

**Setup Steps:**
1. Go to https://firebase.google.com
2. Create project
3. Enable Firestore Database
4. Get config from Project Settings
5. Add Firebase SDK to HTML

**Database Structure:**
```
flowers (collection)
  └── {flowerId} (document)
      ├── question: string
      ├── answer: string
      ├── numPetals: number
      ├── timestamp: number
      └── ...
```

---

### 3. Backend API (Node.js + PostgreSQL/MongoDB)
**Best for**: Full control, custom logic, existing infrastructure

**Pros:**
- Complete control
- Custom business logic
- Can integrate with existing systems

**Cons:**
- Requires server setup
- More complex
- Need to handle hosting

**Tech Stack Options:**
- **Backend**: Node.js + Express, Python + Flask, etc.
- **Database**: PostgreSQL, MongoDB, MySQL
- **Hosting**: Heroku, Railway, Render, AWS

---

## Migration Guide

### From IndexedDB to Supabase

1. **Add Supabase client** to `database.js`
2. **Update methods** to use Supabase API
3. **Keep IndexedDB as fallback** for offline support:

```javascript
async saveFlower(flowerData) {
    // Try Supabase first
    if (this.supabaseClient) {
        try {
            const { data } = await this.supabaseClient.from('flowers').insert([flowerData]);
            return data?.[0]?.id;
        } catch (error) {
            console.error('Supabase error, falling back to IndexedDB:', error);
        }
    }
    
    // Fallback to IndexedDB
    return this.saveToIndexedDB(flowerData);
}
```

---

## Performance Considerations

### Lazy Loading
- ✅ Implemented: Loads 20 flowers at a time
- ✅ Virtual scrolling: Only renders visible flowers
- ✅ Intersection Observer: Detects flowers in viewport

### Optimization Tips
1. **Pagination**: Load in batches (already implemented)
2. **Image optimization**: Compress flower images if storing
3. **Caching**: Cache frequently accessed flowers
4. **CDN**: Use CDN for static assets

---

## Data Structure

Each flower stores:
```javascript
{
    id: string,              // Unique identifier
    question: string,        // User's question
    answer: string,          // YES or NO
    numPetals: number,      // 12-30
    petalRadius: number,    // Default: 88
    discSize: number,        // Default: 120
    seed: number,           // For consistent petal arrangement
    timestamp: number,       // Unix timestamp
    createdAt: string       // ISO date string
}
```

---

## Next Steps

1. **For single-user**: Current IndexedDB implementation is sufficient
2. **For multi-user**: Set up Supabase (recommended) or Firebase
3. **For production**: Add authentication, rate limiting, moderation

---

## Questions?

- Check Supabase docs: https://supabase.com/docs
- Check Firebase docs: https://firebase.google.com/docs
- Current implementation uses IndexedDB - see `database.js` for details
