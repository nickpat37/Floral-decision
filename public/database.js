/**
 * Database Storage Utility
 * Supports multiple storage backends:
 * - Supabase (primary, for multi-user)
 * - IndexedDB (fallback, client-side only)
 * - localStorage (last resort fallback)
 */

class FlowerDatabase {
    constructor() {
        this.dbName = 'FloralDecisionDB';
        this.dbVersion = 1;
        this.storeName = 'flowers';
        this.db = null;
        this.useIndexedDB = 'indexedDB' in window;
        this.supabaseClient = null;
        this.useSupabase = false;
    }
    
    /**
     * Initialize Supabase client if credentials are available
     * Only creates one client instance to avoid "Multiple GoTrueClient instances" warning
     */
    async initSupabase() {
        // Reuse existing client - avoid creating multiple instances
        if (this.supabaseClient) {
            return true;
        }
        
        // Check if Supabase is available and configured
        if (typeof window.SUPABASE_URL === 'undefined' || !window.SUPABASE_URL) {
            console.warn('⚠️ Supabase URL not set. Add window.SUPABASE_URL in index.html (or head).');
            return false;
        }
        
        if (typeof window.SUPABASE_ANON_KEY === 'undefined' || !window.SUPABASE_ANON_KEY) {
            console.warn('⚠️ Supabase anon key not set. Add window.SUPABASE_ANON_KEY in index.html (or head).');
            return false;
        }
        
        try {
            // Use globally loaded Supabase (from script tag) or dynamic import as fallback
            let createClient;
            if (typeof window.supabase !== 'undefined' && window.supabase && window.supabase.createClient) {
                createClient = window.supabase.createClient.bind(window.supabase);
            } else {
                const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
                createClient = mod.createClient;
            }
            this.supabaseClient = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
            this.useSupabase = true;
            console.log('✅ Supabase initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Supabase:', error);
            return false;
        }
    }

    /**
     * Initialize database connection
     * Safe to call multiple times - reuses existing Supabase/IndexedDB connection
     */
    async init() {
        // Try Supabase first (initSupabase returns early if already initialized)
        const supabaseReady = await this.initSupabase();

        const openIndexedDB = () => {
            if (!this.useIndexedDB || this.db) return Promise.resolve();
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.dbVersion);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    this.db = request.result;
                    resolve();
                };
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        const objectStore = db.createObjectStore(this.storeName, {
                            keyPath: 'id',
                            autoIncrement: false
                        });
                        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                        objectStore.createIndex('question', 'question', { unique: false });
                    }
                };
            });
        };

        if (supabaseReady) {
            console.log('✅ Using Supabase for storage');
            // Also open IndexedDB so saveFlower can fall back if Supabase insert fails (e.g. RLS)
            await openIndexedDB().catch(() => {});
            try {
                const { count } = await this.supabaseClient
                    .from('flowers')
                    .select('*', { count: 'exact', head: true });
                console.log(`📊 Supabase connection successful. Current flowers: ${count || 0}`);
            } catch (error) {
                console.warn('⚠️ Supabase connection test failed:', error.message);
            }
            return Promise.resolve();
        }

        // No Supabase: use IndexedDB as primary
        if (this.useIndexedDB) {
            console.log('📦 Using IndexedDB for storage (local only)');
            return openIndexedDB();
        }
        console.warn('💾 IndexedDB not available, using localStorage');
        return Promise.resolve();
    }

    /**
     * Save a flower with question and answer
     * @param {Object} flowerData - { question, answer, numPetals, timestamp, etc. }
     * @returns {Promise<string>} - ID of saved flower
     */
    async saveFlower(flowerData) {
        // Validate required fields
        const question = (flowerData.question != null && String(flowerData.question).trim()) 
            ? String(flowerData.question).trim() 
            : null;
        const answer = (flowerData.answer != null && String(flowerData.answer).trim()) 
            ? String(flowerData.answer).trim() 
            : null;
        if (!question || !answer) {
            console.error('❌ Cannot save flower: question and answer are required', { question: !!question, answer: !!answer });
            throw new Error('Question and answer are required to save a flower');
        }
        
        // Clamp numPetals to valid range: 12-30 - must be integer for Supabase
        const requestedPetals = flowerData.numPetals || Math.floor(Math.random() * (30 - 12 + 1)) + 12;
        const numPetals = Math.max(12, Math.min(30, Math.floor(requestedPetals)));
        if (requestedPetals !== numPetals) {
            console.warn(`🌸 Saving flower: Petal count clamped from ${requestedPetals} to ${numPetals} (valid range: 12-30)`);
        }
        
        // Supabase integer columns reject floats - ensure integers for num_petals, petal_radius, disc_size, timestamp
        const petalRadius = Math.round(Number(flowerData.petalRadius) || 88);
        const discSize = Math.round(Number(flowerData.discSize) || 120);
        const timestamp = Math.floor(Number(flowerData.timestamp) || Date.now());
        const seed = flowerData.seed != null && !isNaN(Number(flowerData.seed)) ? Number(flowerData.seed) : Math.random();
        
        const flower = {
            question: question,
            answer: answer,
            num_petals: numPetals,
            petal_radius: petalRadius,
            disc_size: discSize,
            seed: seed,
            timestamp: timestamp,
            created_at: flowerData.createdAt || new Date().toISOString()
        };

        // Try Supabase first (with retry for deployment/network reliability)
        if (this.useSupabase && this.supabaseClient) {
            const { data: { user } } = await this.supabaseClient.auth.getUser();
            if (user) flower.user_id = user.id;

            let omitUserIdOnRetry = false;
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    let insertPayload = { ...flower };
                    if (attempt === 2 && omitUserIdOnRetry) delete insertPayload.user_id;

                    const { data, error } = await this.supabaseClient
                        .from('flowers')
                        .insert([insertPayload])
                        .select()
                        .single();
                    
                    if (error) throw error;
                    console.log('✅ Flower saved to Supabase:', data.id, '- question:', question.length > 40 ? question.substring(0, 40) + '...' : question);
                    return data.id.toString();
                } catch (error) {
                    console.error(`❌ Supabase save error (attempt ${attempt}):`, error.message);
                    if (error.details) console.error('❌ Supabase details:', error.details);
                    if (error.hint) console.error('❌ Supabase hint:', error.hint);
                    if (error.code) console.error('❌ Supabase code:', error.code);
                    if (attempt === 1) {
                        // Retry without user_id: undefined column, RLS, or user_id-related errors
                        if (
                            error.code === '42703' ||
                            error.code === '42501' ||
                            (error.message && String(error.message).includes('user_id'))
                        ) {
                            omitUserIdOnRetry = true;
                        }
                        continue;
                    }
                    break;
                }
            }
        }

        // Fallback to IndexedDB
        const flowerForIndexedDB = {
            id: flowerData.id || Date.now().toString(),
            question: flower.question,
            answer: flower.answer,
            numPetals: numPetals,
            petalRadius: petalRadius,
            discSize: discSize,
            seed: flower.seed,
            timestamp: flower.timestamp,
            createdAt: flower.created_at
        };

        if (this.useIndexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.add(flowerForIndexedDB);

                request.onsuccess = () => {
                    const savedId = flowerForIndexedDB.id;
                    console.log('✅ Flower saved to IndexedDB with ID:', savedId);
                    console.log('✅ Saved flower data:', flowerForIndexedDB);
                    resolve(savedId);
                };
                request.onerror = () => {
                    console.error('❌ IndexedDB save error:', request.error);
                    reject(request.error);
                };
            });
        } else {
            // Fallback to localStorage
            const flowers = this.getAllFlowersSync();
            flowers.push(flowerForIndexedDB);
            localStorage.setItem('flowers', JSON.stringify(flowers));
            return Promise.resolve(flowerForIndexedDB.id);
        }
    }

    /**
     * Link an existing flower to the current user (after sign-in)
     * @param {string} flowerId - ID of flower to update
     * @returns {Promise<boolean>} - true if updated
     */
    async updateFlowerUserId(flowerId) {
        if (!flowerId) return false;
        if (!this.useSupabase || !this.supabaseClient) return false;
        try {
            const { data: { user } } = await this.supabaseClient.auth.getUser();
            if (!user) return false;

            const flowerIdNum = parseInt(flowerId, 10);
            if (isNaN(flowerIdNum)) return false;

            const { error } = await this.supabaseClient
                .from('flowers')
                .update({ user_id: user.id })
                .eq('id', flowerIdNum);

            if (error) throw error;
            console.log('✅ Flower', flowerId, 'linked to user');
            return true;
        } catch (error) {
            console.error('❌ updateFlowerUserId error:', error.message);
            return false;
        }
    }

    /**
     * Get all flowers
     * @param {Object} options - { limit, offset, orderBy }
     * @returns {Promise<Array>}
     */
    async getAllFlowers(options = {}) {
        const { limit = 20, offset = 0 } = options;

        // Try Supabase first
        if (this.useSupabase && this.supabaseClient) {
            try {
                let query = this.supabaseClient
                    .from('flowers')
                    .select('*')
                    .order('timestamp', { ascending: false })
                    .range(offset, offset + limit - 1);
                
                const { data, error } = await query;
                
                if (error) throw error;
                
                console.log(`📖 Loaded ${data?.length || 0} flowers from Supabase (offset: ${offset}, limit: ${limit})`);
                
                // Convert Supabase format to app format
                return (data || []).map(flower => {
                    // Clamp numPetals to valid range: 12-30
                    const requestedPetals = flower.num_petals || 20;
                    const numPetals = Math.max(12, Math.min(30, Math.floor(requestedPetals)));
                    if (requestedPetals !== numPetals) {
                        console.warn(`🌸 Flower ${flower.id}: Petal count clamped from ${requestedPetals} to ${numPetals} (valid range: 12-30)`);
                    }
                    // Anonymous flowers (user_id = null) are shown as "Anonymous creator"; signed-in flowers get creator name from profiles
                    const creatorName = flower.user_id ? undefined : 'Anonymous';
                    return {
                        id: flower.id.toString(),
                        question: flower.question,
                        answer: flower.answer,
                        numPetals: numPetals,
                        petalRadius: flower.petal_radius,
                        discSize: flower.disc_size,
                        seed: flower.seed,
                        timestamp: flower.timestamp,
                        createdAt: flower.created_at,
                        creatorName: creatorName
                    };
                });
            } catch (error) {
                console.error('❌ Supabase get error, falling back to IndexedDB:', error.message);
                // Fall through to IndexedDB fallback
            }
        }

        // Fallback to IndexedDB
        if (this.useIndexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const index = store.index('timestamp');
                const request = index.openCursor(null, 'prev'); // 'prev' for newest first

                const flowers = [];
                let count = 0;

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor && count < offset + limit) {
                        if (count >= offset) {
                            const flower = cursor.value;
                            // Ensure ID is a string for consistency
                            if (flower.id !== undefined) {
                                flower.id = String(flower.id);
                            }
                            // Clamp numPetals to valid range: 12-30
                            if (flower.numPetals !== undefined) {
                                const requestedPetals = flower.numPetals;
                                const numPetals = Math.max(12, Math.min(30, Math.floor(requestedPetals)));
                                if (requestedPetals !== numPetals) {
                                    console.warn(`🌸 Flower ${flower.id}: Petal count clamped from ${requestedPetals} to ${numPetals} (valid range: 12-30)`);
                                }
                                flower.numPetals = numPetals;
                            }
                            flower.creatorName = flower.creatorName || (!flower.userId && !flower.user_id ? 'Anonymous' : flower.creatorName);
                            flowers.push(flower);
                        }
                        count++;
                        cursor.continue();
                    } else {
                        console.log(`📖 Loaded ${flowers.length} flowers from IndexedDB (offset: ${offset}, limit: ${limit})`);
                        if (flowers.length > 0) {
                            console.log('📖 Flower IDs:', flowers.slice(0, 5).map(f => f.id));
                        }
                        resolve(flowers);
                    }
                };

                request.onerror = () => {
                    console.error('❌ IndexedDB get error:', request.error);
                    reject(request.error);
                };
            });
        } else {
            // Fallback to localStorage
            const flowers = this.getAllFlowersSync();
            // Clamp numPetals for all flowers
            flowers.forEach(flower => {
                if (flower.numPetals !== undefined) {
                    const requestedPetals = flower.numPetals;
                    const numPetals = Math.max(12, Math.min(30, Math.floor(requestedPetals)));
                    if (requestedPetals !== numPetals) {
                        console.warn(`🌸 Flower ${flower.id}: Petal count clamped from ${requestedPetals} to ${numPetals} (valid range: 12-30)`);
                    }
                    flower.numPetals = numPetals;
                }
            });
            flowers.sort((a, b) => b.timestamp - a.timestamp);
            const start = offset;
            const end = offset + limit;
            return Promise.resolve(flowers.slice(start, end));
        }
    }

    /**
     * Get flowers count
     * @returns {Promise<number>}
     */
    async getFlowerCount() {
        // Try Supabase first
        if (this.useSupabase && this.supabaseClient) {
            try {
                const { count, error } = await this.supabaseClient
                    .from('flowers')
                    .select('*', { count: 'exact', head: true });
                
                if (error) throw error;
                return count || 0;
            } catch (error) {
                console.error('Supabase count error, falling back to IndexedDB:', error);
                // Fall through to IndexedDB fallback
            }
        }

        // Fallback to IndexedDB
        if (this.useIndexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.count();

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } else {
            const flowers = this.getAllFlowersSync();
            return Promise.resolve(flowers.length);
        }
    }

    /**
     * Get flower by ID
     * @param {string} id
     * @returns {Promise<Object>}
     */
    async getFlower(id) {
        // Try Supabase first
        if (this.useSupabase && this.supabaseClient) {
            try {
                const idNum = !isNaN(parseInt(id, 10)) ? parseInt(id, 10) : id;
                const { data, error } = await this.supabaseClient
                    .from('flowers')
                    .select('*')
                    .eq('id', idNum)
                    .maybeSingle();
                
                if (error) throw error;
                if (!data) {
                    // Not in Supabase - fall through to IndexedDB or localStorage
                } else {
                    // Convert Supabase format to app format
                    const requestedPetals = data.num_petals || 20;
                    const numPetals = Math.max(12, Math.min(30, Math.floor(requestedPetals)));
                    if (requestedPetals !== numPetals) {
                        console.warn(`🌸 Flower ${data.id}: Petal count clamped from ${requestedPetals} to ${numPetals} (valid range: 12-30)`);
                    }
                    const creatorName = data.user_id ? undefined : 'Anonymous';
                    return {
                        id: data.id.toString(),
                        question: data.question,
                        answer: data.answer,
                        numPetals: numPetals,
                        petalRadius: data.petal_radius,
                        discSize: data.disc_size,
                        seed: data.seed,
                        timestamp: data.timestamp,
                        createdAt: data.created_at,
                        creatorName: creatorName
                    };
                }
            } catch (error) {
                console.error('Supabase get error, falling back to IndexedDB:', error);
                // Fall through to IndexedDB fallback
            }
        }

        // Fallback to IndexedDB
        if (this.useIndexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(id);

                request.onsuccess = () => {
                    const flower = request.result;
                    if (flower && flower.numPetals !== undefined) {
                        // Clamp numPetals to valid range: 12-30
                        const requestedPetals = flower.numPetals;
                        const numPetals = Math.max(12, Math.min(30, Math.floor(requestedPetals)));
                        if (requestedPetals !== numPetals) {
                            console.warn(`🌸 Flower ${flower.id}: Petal count clamped from ${requestedPetals} to ${numPetals} (valid range: 12-30)`);
                        }
                        flower.numPetals = numPetals;
                    }
                    resolve(flower);
                };
                request.onerror = () => reject(request.error);
            });
        } else {
            const flowers = this.getAllFlowersSync();
            const flower = flowers.find(f => String(f.id) === String(id));
            if (flower && flower.numPetals !== undefined) {
                // Clamp numPetals to valid range: 12-30
                const requestedPetals = flower.numPetals;
                const numPetals = Math.max(12, Math.min(30, Math.floor(requestedPetals)));
                if (requestedPetals !== numPetals) {
                    console.warn(`🌸 Flower ${flower.id}: Petal count clamped from ${requestedPetals} to ${numPetals} (valid range: 12-30)`);
                }
                flower.numPetals = numPetals;
            }
            return Promise.resolve(flower);
        }
    }

    /**
     * Delete flower by ID
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteFlower(id) {
        // Try Supabase first
        if (this.useSupabase && this.supabaseClient) {
            try {
                const { error } = await this.supabaseClient
                    .from('flowers')
                    .delete()
                    .eq('id', parseInt(id));
                
                if (error) throw error;
                return;
            } catch (error) {
                console.error('Supabase delete error, falling back to IndexedDB:', error);
                // Fall through to IndexedDB fallback
            }
        }

        // Fallback to IndexedDB
        if (this.useIndexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.delete(id);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } else {
            const flowers = this.getAllFlowersSync();
            const filtered = flowers.filter(f => f.id !== id);
            localStorage.setItem('flowers', JSON.stringify(filtered));
            return Promise.resolve();
        }
    }

    /**
     * Clear all flowers
     * @returns {Promise<void>}
     */
    async clearAll() {
        if (this.useIndexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.clear();

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } else {
            localStorage.removeItem('flowers');
            return Promise.resolve();
        }
    }

    /**
     * Helper: Get all flowers from localStorage (sync)
     */
    getAllFlowersSync() {
        try {
            const stored = localStorage.getItem('flowers');
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('Error reading from localStorage:', e);
            return [];
        }
    }

    // ========== Comments (Supabase only - no IndexedDB fallback) ==========

    /**
     * Get comments for a flower
     * @param {string} flowerId - Flower ID
     * @param {Object} options - { limit, offset } (optional)
     * @returns {Promise<Array>} Array of comment objects
     */
    async getCommentsByFlowerId(flowerId, options = {}) {
        if (!flowerId) return [];
        if (!this.useSupabase || !this.supabaseClient) {
            console.warn('Comments require Supabase');
            return [];
        }
        try {
            const { limit = 100, offset = 0 } = options;
            const flowerIdNum = parseInt(flowerId, 10);
            if (isNaN(flowerIdNum)) return [];

            const { data, error } = await this.supabaseClient
                .from('comments')
                .select('*')
                .eq('flower_id', flowerIdNum)
                .is('parent_id', null)
                .order('created_at', { ascending: true })
                .range(offset, offset + limit - 1);

            if (error) throw error;
            return (data || []).map(c => ({
                id: String(c.id),
                flowerId: String(c.flower_id),
                authorName: c.author_name || 'Anonymous',
                authorAvatarSeed: c.author_avatar_seed || 'Anonymous',
                text: c.text || '',
                likeCount: c.like_count || 0,
                createdAt: c.created_at
            }));
        } catch (error) {
            console.error('❌ getCommentsByFlowerId error:', error.message);
            return [];
        }
    }

    /**
     * Save a new comment
     * @param {Object} commentData - { flowerId, authorName?, authorAvatarSeed?, text }
     * @returns {Promise<string|null>} Comment ID or null on failure
     */
    async saveComment(commentData) {
        const flowerId = commentData.flowerId;
        const text = (commentData.text || '').trim();
        if (!flowerId || !text) {
            console.error('❌ saveComment: flowerId and text are required');
            return null;
        }
        if (!this.useSupabase || !this.supabaseClient) {
            console.warn('Comments require Supabase');
            return null;
        }
        try {
            const flowerIdNum = parseInt(flowerId, 10);
            if (isNaN(flowerIdNum)) return null;

            const authorName = (commentData.authorName || 'Anonymous').trim() || 'Anonymous';
            const authorAvatarSeed = (commentData.authorAvatarSeed || authorName).trim() || 'Anonymous';

            const { data: { user } } = await this.supabaseClient.auth.getUser();
            if (!user) {
                console.error('❌ saveComment: user must be signed in');
                return null;
            }

            const { data, error } = await this.supabaseClient
                .from('comments')
                .insert([{
                    flower_id: flowerIdNum,
                    user_id: user.id,
                    author_name: authorName,
                    author_avatar_seed: authorAvatarSeed,
                    text: text,
                    like_count: 0,
                    parent_id: null
                }])
                .select('id')
                .single();

            if (error) throw error;
            console.log('✅ Comment saved:', data?.id);
            return data ? String(data.id) : null;
        } catch (error) {
            console.error('❌ saveComment error:', error.message);
            return null;
        }
    }

    /**
     * Increment like count for a comment
     * @param {string} commentId - Comment ID
     * @returns {Promise<number|null>} New like count or null on failure
     */
    async incrementCommentLike(commentId) {
        if (!commentId) return null;
        if (!this.useSupabase || !this.supabaseClient) {
            console.warn('Comments require Supabase');
            return null;
        }
        try {
            const commentIdNum = parseInt(commentId, 10);
            if (isNaN(commentIdNum)) return null;

            const { data: current } = await this.supabaseClient
                .from('comments')
                .select('like_count')
                .eq('id', commentIdNum)
                .single();

            const newCount = (current?.like_count ?? 0) + 1;

            const { error } = await this.supabaseClient
                .from('comments')
                .update({ like_count: newCount })
                .eq('id', commentIdNum);

            if (error) throw error;
            return newCount;
        } catch (error) {
            console.error('❌ incrementCommentLike error:', error.message);
            return null;
        }
    }
}

// Export singleton instance
const flowerDB = new FlowerDatabase();
if (typeof window !== 'undefined') window.flowerDB = flowerDB;

// Initialize on load
flowerDB.init().catch(console.error);
