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
        window.authOpenedFromFlowerPage = false;
    }

    function updateAuthButton(profile) {
        const updates = [
            [authAvatar, authLabel, 'Sign in'],
            [null, document.getElementById('flowerPageAuthLabel'), 'Save your flower?']
        ];
        updates.forEach(([avatar, label, signedOutLabel]) => {
            if (!label) return;
            if (profile) {
                if (avatar) {
                    avatar.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(profile.avatarSeed || 'user');
                    avatar.alt = profile.displayName;
                }
                label.textContent = profile.displayName;
            } else {
                if (avatar) {
                    avatar.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Guest';
                    avatar.alt = 'Guest';
                }
                label.textContent = signedOutLabel || 'Sign in';
            }
        });
        const flowerPageAuthBtn = document.getElementById('flowerPageAuthButton');
        const signInBelowDisc = document.getElementById('signInBelowDisc');
        if (authButton) authButton.title = profile ? 'Account' : 'Sign in to comment';
        if (flowerPageAuthBtn) flowerPageAuthBtn.title = profile ? 'Account' : 'Save your flower to the garden';
        if (signInBelowDisc) signInBelowDisc.style.display = profile ? 'none' : '';
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

    if (backdrop || closeBtn) {
        [backdrop, closeBtn].forEach(el => {
            if (el) el.addEventListener('click', closeAuthModal);
        });
    }

    if (showSignUpBtn) showSignUpBtn.addEventListener('click', () => openAuthModal('signUp'));
    if (showSignInBtn) showSignInBtn.addEventListener('click', () => openAuthModal('signIn'));

    function showToast(message) {
        const existing = document.getElementById('flowerSavedToast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'flowerSavedToast';
        toast.className = 'flower-saved-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    async function onAuthSuccessFromFlowerPage(user) {
        const flowerId = window.lastCreatedFlowerId;
        if (flowerId && typeof flowerDB !== 'undefined') {
            await flowerDB.updateFlowerUserId(flowerId);
        }
        closeAuthModal();
        refreshAuthUI();
        (window.onAuthStateChangedCallbacks || []).forEach(fn => { try { fn(user); } catch (_) {} });
        showToast('Your flower has been saved!');
        setTimeout(() => {
            if (typeof window.goToGardenWithFlower === 'function') {
                window.goToGardenWithFlower(flowerId);
            }
        }, 2000);
    }

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
            if (window.authOpenedFromFlowerPage) {
                await onAuthSuccessFromFlowerPage(user);
            } else {
                closeAuthModal();
                refreshAuthUI();
                (window.onAuthStateChangedCallbacks || []).forEach(fn => { try { fn(user); } catch (_) {} });
            }
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
            if (window.authOpenedFromFlowerPage) {
                await onAuthSuccessFromFlowerPage(user);
            } else {
                closeAuthModal();
                refreshAuthUI();
                (window.onAuthStateChangedCallbacks || []).forEach(fn => { try { fn(user); } catch (_) {} });
            }
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
