/**
 * Auth UI - Modal, forms, auth button state
 */

(function() {
    const modal = document.getElementById('authModal');
    const backdrop = modal?.querySelector('.auth-modal-backdrop');
    const closeBtn = modal?.querySelector('.auth-modal-close');
    const authButton = document.getElementById('authButton');
    const authAvatar = document.getElementById('authAvatar');
    const authLabel = document.getElementById('authLabel');
    const flowerPageAuthButton = document.getElementById('flowerPageAuthButton');
    const flowerPageAuthAvatar = document.getElementById('flowerPageAuthAvatar');
    const flowerPageAuthLabel = document.getElementById('flowerPageAuthLabel');

    const signInPanel = document.getElementById('authModalSignIn');
    const signUpPanel = document.getElementById('authModalSignUp');
    const signedInPanel = document.getElementById('authModalSignedIn');

    const signInForm = document.getElementById('authSignInForm');
    const signUpForm = document.getElementById('authSignUpForm');
    const signInError = document.getElementById('authSignInError');
    const signUpError = document.getElementById('authSignUpError');
    const showSignUpBtn = document.getElementById('authShowSignUp');
    const showSignInBtn = document.getElementById('authShowSignIn');
    const signOutBtn = document.getElementById('authSignOutBtn');

    const signedInAvatar = document.getElementById('authSignedInAvatar');
    const signedInName = document.getElementById('authSignedInName');

    async function openAuthModal(panel) {
        if (!modal) return;
        signInPanel.style.display = 'none';
        signUpPanel.style.display = 'none';
        signedInPanel.style.display = 'none';
        if (panel === 'signUp') signUpPanel.style.display = 'block';
        else if (panel === 'signedIn') {
            signedInPanel.style.display = 'block';
            const p = await window.auth.getProfile();
            if (p) {
                signedInAvatar.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(p.avatarSeed || 'user');
                signedInName.textContent = p.displayName;
            }
        } else signInPanel.style.display = 'block';
        signInError.style.display = 'none';
        signUpError.style.display = 'none';
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeAuthModal() {
        if (!modal) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
    }

    function updateAuthButton(profile) {
        const updates = [
            [authAvatar, authLabel],
            [flowerPageAuthAvatar, flowerPageAuthLabel]
        ];
        updates.forEach(([avatar, label]) => {
            if (!avatar || !label) return;
            if (profile) {
                avatar.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(profile.avatarSeed || 'user');
                avatar.alt = profile.displayName;
                label.textContent = profile.displayName;
            } else {
                avatar.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Guest';
                avatar.alt = 'Guest';
                label.textContent = 'Sign in';
            }
        });
        if (authButton) authButton.title = profile ? 'Account' : 'Sign in to comment';
        if (flowerPageAuthButton) flowerPageAuthButton.title = profile ? 'Account' : 'Sign in to comment';
    }

    async function refreshAuthUI() {
        if (typeof window.auth === 'undefined') return;
        const profile = await window.auth.getProfile();
        updateAuthButton(profile);
    }

    function onAuthButtonClick() {
        if (typeof window.auth === 'undefined') return;
        window.auth.getSession().then(({ user }) => {
            if (user) openAuthModal('signedIn');
            else openAuthModal('signIn');
        });
    }
    if (authButton) authButton.addEventListener('click', onAuthButtonClick);
    if (flowerPageAuthButton) flowerPageAuthButton.addEventListener('click', onAuthButtonClick);

    if (backdrop || closeBtn) {
        [backdrop, closeBtn].forEach(el => {
            if (el) el.addEventListener('click', closeAuthModal);
        });
    }

    if (showSignUpBtn) showSignUpBtn.addEventListener('click', () => openAuthModal('signUp'));
    if (showSignInBtn) showSignInBtn.addEventListener('click', () => openAuthModal('signIn'));

    if (signInForm) {
        signInForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('authSignInEmail')?.value?.trim();
            const password = document.getElementById('authSignInPassword')?.value;
            if (!email || !password) return;
            signInError.style.display = 'none';
            const { user, error } = await window.auth.signIn(email, password);
            if (error) {
                signInError.textContent = error.message || 'Sign in failed';
                signInError.style.display = 'block';
                return;
            }
            closeAuthModal();
            refreshAuthUI();
            (window.onAuthStateChangedCallbacks || []).forEach(fn => { try { fn(user); } catch (_) {} });
        });
    }

    if (signUpForm) {
        signUpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const displayName = document.getElementById('authSignUpDisplayName')?.value?.trim();
            const email = document.getElementById('authSignUpEmail')?.value?.trim();
            const password = document.getElementById('authSignUpPassword')?.value;
            if (!email || !password) return;
            signUpError.style.display = 'none';
            const { user, error } = await window.auth.signUp(email, password, displayName);
            if (error) {
                signUpError.textContent = error.message || 'Sign up failed';
                signUpError.style.display = 'block';
                return;
            }
            closeAuthModal();
            refreshAuthUI();
            (window.onAuthStateChangedCallbacks || []).forEach(fn => { try { fn(user); } catch (_) {} });
        });
    }

    if (signOutBtn) {
        signOutBtn.addEventListener('click', async () => {
            await window.auth.signOut();
            closeAuthModal();
            updateAuthButton(null);
            (window.onAuthStateChangedCallbacks || []).forEach(fn => { try { fn(null); } catch (_) {} });
        });
    }

    if (typeof window.auth !== 'undefined') {
        window.auth.onAuthStateChange(() => refreshAuthUI());
        window.auth.getSession().then(({ user }) => {
            if (user) {
                window.auth.getProfile().then(p => {
                    if (p) {
                        signedInAvatar.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(p.avatarSeed || 'user');
                        signedInName.textContent = p.displayName;
                    }
                });
            }
        });
        refreshAuthUI();
    }

    window.authUI = {
        openAuthModal,
        closeAuthModal,
        refreshAuthUI,
        updateAuthButton
    };
})();
