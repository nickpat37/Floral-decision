/**
 * Supabase Auth - Sign up, sign in, sign out, session, profile
 */

(function() {
    let _supabase = null;
    let _profileCache = null;

    function getSupabase() {
        if (_supabase) return _supabase;
        const db = typeof window.flowerDB !== 'undefined' ? window.flowerDB : null;
        if (db && db.supabaseClient) {
            _supabase = db.supabaseClient;
            return _supabase;
        }
        if (typeof window.supabase !== 'undefined' && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
            _supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
            return _supabase;
        }
        return null;
    }

    /**
     * Sign up with email, password, and optional display name
     * @param {string} email
     * @param {string} password
     * @param {string} [displayName]
     * @returns {Promise<{user: object|null, error: Error|null}>}
     */
    async function signUp(email, password, displayName) {
        const supabase = getSupabase();
        if (!supabase) return { user: null, error: new Error('Supabase not configured') };
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    display_name: displayName || email.split('@')[0],
                    avatar_seed: displayName || email.split('@')[0] || 'user'
                }
            }
        });
        return { user: data?.user ?? null, error: error ?? null };
    }

    /**
     * Sign in with email and password
     * @param {string} email
     * @param {string} password
     * @returns {Promise<{user: object|null, error: Error|null}>}
     */
    async function signIn(email, password) {
        const supabase = getSupabase();
        if (!supabase) return { user: null, error: new Error('Supabase not configured') };
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        return { user: data?.user ?? null, error: error ?? null };
    }

    /**
     * Sign out
     */
    async function signOut() {
        const supabase = getSupabase();
        _profileCache = null;
        if (supabase) await supabase.auth.signOut();
    }

    /**
     * Get current session (includes user)
     * @returns {Promise<{user: object|null, session: object|null}>}
     */
    async function getSession() {
        const supabase = getSupabase();
        if (!supabase) return { user: null, session: null };
        const { data } = await supabase.auth.getSession();
        return { user: data.session?.user ?? null, session: data.session ?? null };
    }

    /**
     * Get current user's profile (display_name, avatar_seed) from profiles table
     * @returns {Promise<{displayName: string, avatarSeed: string, userId: string}|null>}
     */
    async function getProfile() {
        const supabase = getSupabase();
        if (!supabase) return null;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        if (_profileCache && _profileCache.id === user.id) return _profileCache;
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('display_name, avatar_seed')
            .eq('id', user.id)
            .maybeSingle();
        if (error || !profile) {
            return {
                id: user.id,
                displayName: user.user_metadata?.display_name || user.email?.split('@')[0] || 'User',
                avatarSeed: user.user_metadata?.avatar_seed || user.id?.substring(0, 8) || 'user'
            };
        }
        _profileCache = {
            id: user.id,
            displayName: profile.display_name || 'User',
            avatarSeed: profile.avatar_seed || user.id?.substring(0, 8)
        };
        return _profileCache;
    }

    /**
     * Update profile display name
     * @param {string} displayName
     * @returns {Promise<boolean>}
     */
    async function updateProfile(displayName) {
        const supabase = getSupabase();
        if (!supabase) return false;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;
        const { error } = await supabase
            .from('profiles')
            .update({
                display_name: displayName || 'User',
                avatar_seed: displayName || user.id?.substring(0, 8),
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id);
        if (!error) _profileCache = null;
        return !error;
    }

    /**
     * Subscribe to auth state changes
     * @param {(event: string, session: object|null) => void} callback
     * @returns {{unsubscribe: () => void}}
     */
    function onAuthStateChange(callback) {
        const supabase = getSupabase();
        if (!supabase) return { unsubscribe: () => {} };
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
            _profileCache = null;
            callback(event, session);
        });
        return data;
    }

    if (typeof window !== 'undefined') {
        window.auth = {
            signUp,
            signIn,
            signOut,
            getSession,
            getProfile,
            updateProfile,
            onAuthStateChange,
            getSupabase
        };
    }
})();
