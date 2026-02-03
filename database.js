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
     */
    async initSupabase() {
        // Check if Supabase is available and configured
        if (typeof window.SUPABASE_URL === 'undefined' || !window.SUPABASE_URL) {
            return false;
        }
        
        if (typeof window.SUPABASE_ANON_KEY === 'undefined' || !window.SUPABASE_ANON_KEY) {
            console.log('Supabase anon key not set, using IndexedDB');
            return false;
        }
        
        try {
            // Dynamically import Supabase client
            const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
            this.supabaseClient = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
            this.useSupabase = true;
            console.log('Supabase initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize Supabase:', error);
            return false;
        }
    }

    /**
     * Initialize database connection
     */
    async init() {
        // Try Supabase first
        const supabaseReady = await this.initSupabase();
        
        if (supabaseReady) {
            console.log('✅ Using Supabase for storage');
            // Test connection
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
        
        // Fallback to IndexedDB
        if (this.useIndexedDB) {
            console.log('📦 Using IndexedDB for storage (local only)');
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
                            autoIncrement: true
                        });
                        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                        objectStore.createIndex('question', 'question', { unique: false });
                    }
                };
            });
        } else {
            // Fallback to localStorage
            console.warn('💾 IndexedDB not available, using localStorage');
            return Promise.resolve();
        }
    }

    /**
     * Save a flower with question and answer
     * @param {Object} flowerData - { question, answer, numPetals, timestamp, etc. }
     * @returns {Promise<string>} - ID of saved flower
     */
    async saveFlower(flowerData) {
        const flower = {
            question: flowerData.question,
            answer: flowerData.answer,
            num_petals: flowerData.numPetals || Math.floor(Math.random() * (30 - 12 + 1)) + 12,
            petal_radius: flowerData.petalRadius || 88,
            disc_size: flowerData.discSize || 120,
            seed: flowerData.seed || Math.random(),
            timestamp: flowerData.timestamp || Date.now(),
            created_at: flowerData.createdAt || new Date().toISOString()
        };

        // Try Supabase first
        if (this.useSupabase && this.supabaseClient) {
            try {
                const { data, error } = await this.supabaseClient
                    .from('flowers')
                    .insert([flower])
                    .select()
                    .single();
                
                if (error) throw error;
                console.log('✅ Flower saved to Supabase:', data.id);
                return data.id.toString();
            } catch (error) {
                console.error('❌ Supabase save error, falling back to IndexedDB:', error.message);
                // Fall through to IndexedDB fallback
            }
        }

        // Fallback to IndexedDB
        const flowerForIndexedDB = {
            id: flowerData.id || Date.now().toString(),
            question: flower.question,
            answer: flower.answer,
            numPetals: flower.num_petals,
            petalRadius: flower.petal_radius,
            discSize: flower.disc_size,
            seed: flower.seed,
            timestamp: flower.timestamp,
            createdAt: flower.created_at
        };

        if (this.useIndexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.add(flowerForIndexedDB);

                request.onsuccess = () => resolve(flowerForIndexedDB.id);
                request.onerror = () => reject(request.error);
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
                return (data || []).map(flower => ({
                    id: flower.id.toString(),
                    question: flower.question,
                    answer: flower.answer,
                    numPetals: flower.num_petals,
                    petalRadius: flower.petal_radius,
                    discSize: flower.disc_size,
                    seed: flower.seed,
                    timestamp: flower.timestamp,
                    createdAt: flower.created_at
                }));
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
                            flowers.push(cursor.value);
                        }
                        count++;
                        cursor.continue();
                    } else {
                        resolve(flowers);
                    }
                };

                request.onerror = () => reject(request.error);
            });
        } else {
            // Fallback to localStorage
            const flowers = this.getAllFlowersSync();
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
                const { data, error } = await this.supabaseClient
                    .from('flowers')
                    .select('*')
                    .eq('id', parseInt(id))
                    .single();
                
                if (error) throw error;
                
                // Convert Supabase format to app format
                return {
                    id: data.id.toString(),
                    question: data.question,
                    answer: data.answer,
                    numPetals: data.num_petals,
                    petalRadius: data.petal_radius,
                    discSize: data.disc_size,
                    seed: data.seed,
                    timestamp: data.timestamp,
                    createdAt: data.created_at
                };
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

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } else {
            const flowers = this.getAllFlowersSync();
            const flower = flowers.find(f => f.id === id);
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
}

// Export singleton instance
const flowerDB = new FlowerDatabase();

// Initialize on load
flowerDB.init().catch(console.error);
