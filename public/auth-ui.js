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
    const confirmPanel = document.getElementById('authModalConfirm');
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

    async function openAuthModal(panel, options) {
        if (!modal) return;
        signInPanel.style.display = 'none';
        signUpPanel.style.display = 'none';
        if (confirmPanel) confirmPanel.style.display = 'none';
        signedInPanel.style.display = 'none';
        if (panel === 'signUp') signUpPanel.style.display = 'block';
        else if (panel === 'confirm') {
            if (confirmPanel) {
                const titleEl = document.getElementById('authConfirmTitle');
                const msgEl = document.getElementById('authConfirmMessage');
                const btnEl = document.getElementById('authConfirmClose');
                const imgEl = document.getElementById('authConfirmImage');
                if (options?.title && titleEl) titleEl.textContent = options.title;
                else if (titleEl) titleEl.textContent = 'Check your email';
                if (options?.message && msgEl) msgEl.textContent = options.message;
                else if (msgEl) msgEl.textContent = "We've sent you a confirmation link. Click it to verify your account.";
                if (options?.buttonText && btnEl) btnEl.textContent = options.buttonText;
                else if (btnEl) btnEl.textContent = 'Got it';
                if (imgEl) imgEl.style.display = options?.showImage ? '' : 'none';
                confirmPanel.style.display = 'flex';
            }
        } else if (panel === 'signedIn') {
            signedInPanel.style.display = 'block';
            const p = await window.auth.getProfile();
            if (p) {
                const initial = String(p.displayName || '').trim().charAt(0).toUpperCase() || '?';
                signedInAvatar.innerHTML = `<span class="auth-avatar-initial">${escapeHtml(initial)}</span>`;
                signedInAvatar.setAttribute('aria-label', `${escapeHtml(p.displayName)} avatar`);
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
        window.authConfirmFlowerSaved = false;
        window.authConfirmFlowerId = null;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function updateAuthButton(profile) {
        const updates = [
            [authAvatar, authLabel, 'Sign in'],
            [null, document.getElementById('flowerPageAuthLabel'), 'Sign in to link (optional)']
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

        if (authButton) {
            authButton.title = profile ? 'Account' : 'Sign in to comment';
            const displayName = profile?.displayName || '';
            const initial = displayName.trim().charAt(0).toUpperCase() || '?';

            if (profile) {
                authButton.innerHTML = `<span class="auth-button-initial">${escapeHtml(initial)}</span>`;
            } else {
                authButton.innerHTML = `<span class="auth-button-flower" aria-hidden="true"><img src="/Daisy_icon.png" alt="" width="20" height="20"></span>`;
            }
        }

        const flowerPageAuthBtn = document.getElementById('flowerPageAuthButton');
        const signInBelowDisc = document.getElementById('signInBelowDisc');
        if (flowerPageAuthBtn) flowerPageAuthBtn.title = profile ? 'Account' : 'Sign in to link this flower to your account (optional)';
        if (signInBelowDisc) signInBelowDisc.style.display = profile ? 'none' : '';
    }

    async function refreshAuthUI() {
        if (typeof window.auth === 'undefined') return;
        const profile = await window.auth.getProfile();
        updateAuthButton(profile);
        (window.onAuthStateChangedCallbacks || []).forEach(fn => { try { fn(profile); } catch (_) {} });
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
        refreshAuthUI();
        (window.onAuthStateChangedCallbacks || []).forEach(fn => { try { fn(user); } catch (_) {} });
        window.authConfirmFlowerSaved = true;
        window.authConfirmFlowerId = flowerId;
        openAuthModal('confirm', {
            title: 'Success!',
            message: 'Your flower has been saved to the garden.',
            buttonText: 'Go to garden',
            showImage: true
        });
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
                openAuthModal('confirm');
                refreshAuthUI();
                (window.onAuthStateChangedCallbacks || []).forEach(fn => { try { fn(user); } catch (_) {} });
            }
        });
    }

    const confirmCloseBtn = document.getElementById('authConfirmClose');
    if (confirmCloseBtn) {
        confirmCloseBtn.addEventListener('click', () => {
            if (window.authConfirmFlowerSaved) {
                const flowerId = window.authConfirmFlowerId;
                window.authConfirmFlowerSaved = false;
                window.authConfirmFlowerId = null;
                closeAuthModal();
                if (typeof window.goToGardenWithFlower === 'function') {
                    window.goToGardenWithFlower(flowerId);
                }
            } else {
                closeAuthModal();
            }
        });
    }

    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            closeAuthModal();
            updateAuthButton(null);
            (window.onAuthStateChangedCallbacks || []).forEach(fn => { try { fn(null); } catch (_) {} });
            (async () => {
                try {
                    if (typeof window.auth !== 'undefined') await window.auth.signOut();
                } catch (err) {
                    console.warn('Sign out:', err?.message || err);
                }
            })();
        });
    }

    if (typeof window.auth !== 'undefined') {
        window.auth.onAuthStateChange(() => refreshAuthUI());
        window.auth.getSession().then(({ user }) => {
            if (user) {
                window.auth.getProfile().then(p => {
                    if (p) {
                        const initial = String(p.displayName || '').trim().charAt(0).toUpperCase() || '?';
                        signedInAvatar.innerHTML = `<span class="auth-avatar-initial">${escapeHtml(initial)}</span>`;
                        signedInAvatar.setAttribute('aria-label', `${escapeHtml(p.displayName)} avatar`);
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
