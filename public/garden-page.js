/**
 * Garden Page Handler - Infinite Canvas with Lazy Loading
 * - Shows fewer flowers to reduce memory/bandwidth
 * - Flowers with questions are isolated with empty space
 * - Other flowers are densely packed
 * - Lazy loading: only render flowers when user drags to new area
 */

class GardenPage {
    constructor() {
        this.container = null;
        this.canvas = null;
        this.flowers = [];
        this.loadedFlowers = new Map(); // Track rendered flower instances
        this.ghostFlowers = []; // Decorative ghost flowers (image only, no question/grass)
        this.loadedGhostFlowers = new Map(); // Rendered ghost flower wrappers
        this.centerFlowers = []; // Array of flowers near center (max 1)
        this.questionBubbles = []; // Array of active question bubbles
        this.maxBubbles = 1; // Maximum number of bubbles to show (only closest to center)
        this.particlesWrapper = null; // Particles around newest flower
        this.particlesAnimationId = null;
        this.newestFlowerId = null; // Track which flower gets particles

        // Canvas settings
        this.canvasSize = 10000; // Virtual canvas size (10000x10000)
        this.flowerSpread = 300;
        this.isolatedSpread = 280; // Flowers with questions
        this.denseSpread = 160;
        this.minFlowerDistance = 140;
        this.viewportPaddingPercent = 0.03; // 3% buffer to avoid edge flicker; terminate when clearly out
        // Ghost flower: image-only decorative flowers in empty gaps (max 30% overlap with real/ghost)
        this.ghostFlowerDisplaySize = 400; // same as real flower wrapper (400x400)
        this.ghostFlowerRadius = 150; // for overlap math (same visual extent as real flower)
        this.realFlowerRadius = 150; // effective radius for overlap math
        this.minGhostToReal = 180; // min center distance to keep overlap < 30% of real
        this.minGhostToGhost = 160; // min center distance between ghost flowers
        this.maxGhostFlowers = 120; // dense to fill empty space
        this.maxRenderedFlowers = 10; // Only 10 flowers rendered at a time
        this.minRenderedFlowers = 3; // Minimum for initial load edge cases
        
        // Throttling for updateVisibleFlowers to reduce lag
        this.updateVisibleFlowersThrottle = null;
        this.updateVisibleFlowersDelay = 150; // Update every 150ms max (smoother panning)

        // Pan/scroll state
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.lastTouchX = 0;
        this.lastTouchY = 0;
        this.lastRenderedArea = null; // Track last rendered area for lazy loading

        // Loading state
        this.isLoading = false;
        this.allFlowersLoaded = false;
        this.maxFlowersToShow = 50; // Load more from DB; only 10 rendered at once (lazy)
        this.initialized = false; // Track if initialization is complete

        // Start initialization (async, but don't block constructor)
        // Note: init() will set this.initialized = true when it completes
        this.init().catch((error) => {
            console.error('🌸 Garden page initialization failed:', error);
            this.initialized = false;
        });
    }

    async init() {
        try {
            // Ensure we're in the right context
            if (typeof document === 'undefined') {
                console.error('🌸 Document is not available');
                this.initialized = false;
                return;
            }
            
            this.container = document.getElementById('gardenContainer');
            if (!this.container) {
                console.error('🌸 Garden container not found, cannot initialize');
                console.error('🌸 Available elements with id:', Array.from(document.querySelectorAll('[id]')).map(el => el.id).slice(0, 10));
                this.initialized = false;
                return;
            }

        // Hide empty state initially (will be shown if no flowers)
        this.hideEmptyState();

        // Add gradual blur behind top nav
        this.setupGradualBlur();

        // Create the inner canvas element
        this.canvas = document.createElement('div');
        this.canvas.className = 'garden-canvas';
        this.canvas.style.width = `${this.canvasSize}px`;
        this.canvas.style.height = `${this.canvasSize}px`;
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.container.appendChild(this.canvas);

        // Wait for database to be ready
        if (typeof flowerDB !== 'undefined') {
            await flowerDB.init();
        }

        // Setup pan/scroll interactions
        this.setupPanControls();

        // Setup navigation
        this.setupNavigation();

        // Setup question popup (tap truncated question to view full)
        this.setupQuestionPopup();

        // Setup comment input (arrow button, auto-expand textarea)
        this.setupCommentInput();

        // Update comment placeholder when auth state changes
        window.onAuthStateChangedCallbacks = window.onAuthStateChangedCallbacks || [];
        window.onAuthStateChangedCallbacks.push(() => this.updateCommentInputAuthState());

        // Event delegation for comment Like buttons
        this.setupCommentListDelegation();

        // Setup window resize handler to update viewport calculations
        window.addEventListener('resize', () => {
            // Clear throttle to allow immediate update on resize
            if (this.updateVisibleFlowersThrottle) {
                clearTimeout(this.updateVisibleFlowersThrottle);
                this.updateVisibleFlowersThrottle = null;
            }
            // Update visible flowers with new viewport size
            this.throttledUpdateVisibleFlowers();
        });

        // Load flowers (limited number)
        await this.loadAllFlowers();

        // Verify flowers were loaded - show empty state if no database flowers
        if (this.flowers.length === 0) {
            console.log('🌸 No flowers from database - showing empty state');
            this.showEmptyState();
            this.generateGhostFlowers();
        } else {
            // Ensure empty state is hidden if we have flowers
            this.hideEmptyState();
            
            // CRITICAL: Center and render flowers after successful load
            if (this.flowers.length > 0) {
                const newest = this.flowers[0];
                if (newest && newest.canvasX && newest.canvasY) {
                    console.log(`🌸 Centering on newest flower at (${newest.canvasX}, ${newest.canvasY})`);
                    this.centerOn(newest.canvasX, newest.canvasY);
                    // Ensure flowers and ghosts render (second pass catches async flower creation)
                    [100, 400].forEach(ms => setTimeout(() => {
                        if (this.updateVisibleFlowersThrottle) clearTimeout(this.updateVisibleFlowersThrottle);
                        this.updateVisibleFlowers();
                        console.log(`🌸 Render pass: ${this.loadedFlowers.size} flowers, ${this.loadedGhostFlowers.size} ghosts`);
                    }, ms));
                } else {
                    console.warn('🌸 Newest flower missing position, centering on canvas middle');
                    this.centerOn(this.canvasSize / 2, this.canvasSize / 2);
                    [100, 400].forEach(ms => setTimeout(() => {
                        if (this.updateVisibleFlowersThrottle) clearTimeout(this.updateVisibleFlowersThrottle);
                        this.updateVisibleFlowers();
                    }, ms));
                }
            }
        }

        this.initialized = true;
        console.log('🌸 Garden infinite canvas initialized');
        console.log('🌸 Final flowers array length:', this.flowers.length);
        if (this.flowers.length > 0) {
            console.log('🌸 Sample flower:', {
                id: this.flowers[0].id,
                position: `(${this.flowers[0].canvasX}, ${this.flowers[0].canvasY})`,
                question: this.flowers[0].question
            });
            
            // CRITICAL: Ensure flowers are rendered after initialization completes
            // This is a final safety check to ensure flowers appear
            setTimeout(() => {
                if (this.canvas && this.flowers.length > 0 && this.loadedFlowers.size === 0) {
                    console.log('🌸 No flowers rendered after init, forcing render...');
                    // Clear throttle
                    if (this.updateVisibleFlowersThrottle) {
                        clearTimeout(this.updateVisibleFlowersThrottle);
                        this.updateVisibleFlowersThrottle = null;
                    }
                    // Force update
                    this.updateVisibleFlowers();
                    console.log(`🌸 Forced render complete: ${this.loadedFlowers.size} flowers rendered`);
                }
            }, 200);
        } else {
            console.error('🌸 CRITICAL: Initialization completed with ZERO flowers!');
        }
        } catch (error) {
            console.error('🌸 Error during garden page initialization:', error);
            console.error('🌸 Error stack:', error.stack);
            this.initialized = false;
        }
    }

    /**
     * Gradual blur behind top nav (vanilla port of GradualBlur - github.com/ansh-dhanani)
     */
    setupGradualBlur() {
        const pageContainer = this.container && this.container.parentElement;
        if (!pageContainer) return;

        const config = {
            position: 'top',
            strength: 2,
            height: '7rem',
            divCount: 5,
            curve: 'bezier',
            exponential: true,
            opacity: 1
        };

        const curveFunc = (p) => (config.curve === 'bezier' ? p * p * (3 - 2 * p) : p);
        const direction = config.position === 'top' ? 'to top' : config.position === 'bottom' ? 'to bottom' : config.position === 'left' ? 'to left' : 'to right';

        const wrapper = document.createElement('div');
        wrapper.className = 'garden-gradual-blur';
        wrapper.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: ${config.height};
            pointer-events: none;
            z-index: 50;
        `;

        const increment = 100 / config.divCount;
        for (let i = 1; i <= config.divCount; i++) {
            let progress = i / config.divCount;
            progress = curveFunc(progress);

            let blurValue;
            if (config.exponential) {
                blurValue = Math.pow(2, progress * 4) * 0.0625 * config.strength;
            } else {
                blurValue = 0.0625 * (progress * config.divCount + 1) * config.strength;
            }

            const p1 = Math.round((increment * i - increment) * 10) / 10;
            const p2 = Math.round(increment * i * 10) / 10;
            const p3 = Math.round((increment * i + increment) * 10) / 10;
            const p4 = Math.round((increment * i + increment * 2) * 10) / 10;

            let gradient = `transparent ${p1}%, black ${p2}%`;
            if (p3 <= 100) gradient += `, black ${p3}%`;
            if (p4 <= 100) gradient += `, transparent ${p4}%`;

            const div = document.createElement('div');
            div.style.cssText = `
                position: absolute;
                inset: 0;
                mask-image: linear-gradient(${direction}, ${gradient});
                -webkit-mask-image: linear-gradient(${direction}, ${gradient});
                backdrop-filter: blur(${blurValue.toFixed(3)}rem);
                -webkit-backdrop-filter: blur(${blurValue.toFixed(3)}rem);
                opacity: ${config.opacity};
            `;
            wrapper.appendChild(div);
        }

        pageContainer.insertBefore(wrapper, pageContainer.firstChild);
    }

    /**
     * Setup pan/scroll controls for infinite canvas
     */
    setupPanControls() {
        // Mouse drag
        this.container.addEventListener('mousedown', (e) => this.onDragStart(e));
        document.addEventListener('mousemove', (e) => this.onDragMove(e));
        document.addEventListener('mouseup', (e) => this.onDragEnd(e));

        // Touch drag
        this.container.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.container.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.container.addEventListener('touchend', (e) => this.onDragEnd(e));

        // Mouse wheel for zoom/pan
        this.container.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    }

    onDragStart(e) {
        this.isDragging = true;
        this.wasDrag = false;
        this.tapStartX = e.clientX;
        this.tapStartY = e.clientY;
        this.tapStartTime = Date.now();
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.container.style.cursor = 'grabbing';
    }

    onDragMove(e) {
        if (!this.isDragging) return;
        const dx = e.clientX - this.tapStartX;
        const dy = e.clientY - this.tapStartY;
        if (Math.sqrt(dx * dx + dy * dy) > 10) this.wasDrag = true;

        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;
        this.pan(deltaX, deltaY);

        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }

    onDragEnd(e) {
        const isTap = !this.wasDrag && this.tapStartTime && (Date.now() - this.tapStartTime) < 400;
        let clientX = this.lastMouseX;
        let clientY = this.lastMouseY;
        if (e) {
            if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
            } else if (e.clientX !== undefined) {
                clientX = e.clientX;
                clientY = e.clientY;
            }
        }
        this.isDragging = false;
        this.container.style.cursor = 'grab';
        if (isTap) this.handleDiscTapAt(clientX, clientY);
        this.checkAndLazyLoad();
    }

    onTouchStart(e) {
        if (e.touches.length === 1) {
            this.isDragging = true;
            this.wasDrag = false;
            this.tapStartX = e.touches[0].clientX;
            this.tapStartY = e.touches[0].clientY;
            this.tapStartTime = Date.now();
            this.lastTouchX = e.touches[0].clientX;
            this.lastTouchY = e.touches[0].clientY;
        }
    }

    onTouchMove(e) {
        if (!this.isDragging || e.touches.length !== 1) return;
        e.preventDefault();
        const dx = e.touches[0].clientX - this.tapStartX;
        const dy = e.touches[0].clientY - this.tapStartY;
        if (Math.sqrt(dx * dx + dy * dy) > 10) this.wasDrag = true;

        const deltaX = e.touches[0].clientX - this.lastTouchX;
        const deltaY = e.touches[0].clientY - this.lastTouchY;
        this.pan(deltaX, deltaY);

        this.lastTouchX = e.touches[0].clientX;
        this.lastTouchY = e.touches[0].clientY;
    }

    onWheel(e) {
        e.preventDefault();
        const deltaX = e.shiftKey ? -e.deltaY : -e.deltaX;
        const deltaY = e.shiftKey ? 0 : -e.deltaY;
        this.pan(deltaX, deltaY);
        // Check for lazy loading after wheel
        setTimeout(() => this.checkAndLazyLoad(), 100);
    }

    /**
     * Pan the canvas by delta amounts
     */
    pan(deltaX, deltaY) {
        this.offsetX += deltaX;
        this.offsetY += deltaY;

        // Clamp to canvas bounds
        const maxOffset = this.canvasSize - window.innerWidth;
        const maxOffsetY = this.canvasSize - window.innerHeight;
        this.offsetX = Math.max(-maxOffset, Math.min(0, this.offsetX));
        this.offsetY = Math.max(-maxOffsetY, Math.min(0, this.offsetY));

        // Apply transform
        this.canvas.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px)`;

        // Update center flower immediately during pan for faster bubble updates
        this.updateCenterFlower();

        // Throttle updateVisibleFlowers to reduce lag during panning
        // Only if we have flowers loaded
        if (this.flowers.length > 0) {
            this.throttledUpdateVisibleFlowers();
        }
    }

    /**
     * Handle disc tap when user taps (without dragging) on the canvas.
     * Hit-test to find which flower disc was tapped and trigger tap animation + show answer.
     * @param {number} clientX - Screen X of tap
     * @param {number} clientY - Screen Y of tap
     */
    handleDiscTapAt(clientX, clientY) {
        if (!this.container || !this.canvas) return;
        const rect = this.container.getBoundingClientRect();
        const containerX = clientX - rect.left;
        const containerY = clientY - rect.top;
        const canvasX = containerX - this.offsetX;
        const canvasY = containerY - this.offsetY;

        // Hit area: wrapper uses translate(-50%,-50%) so center is at (canvasX, canvasY)
        const hitRadius = 120;
        for (const [flowerId, flowerRef] of this.loadedFlowers) {
            if (!flowerRef?.wrapper || !flowerRef?.instance) continue;
            const data = flowerRef.data;
            const centerX = data.canvasX || 0;
            const centerY = data.canvasY || 0;
            const dx = canvasX - centerX;
            const dy = canvasY - centerY;
            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                const instance = flowerRef.instance;
                if (instance.triggerTapAnimation) instance.triggerTapAnimation();
                const disc = flowerRef.wrapper.querySelector('.flower-disc');
                if (disc && data.answer) this.addAnswerToDisc(disc, data.answer, data.discSize || 120);
                this.showGardenCommentSection(flowerId, flowerRef);
                return;
            }
        }
        this.hideGardenCommentSection();
    }

    showGardenCommentSection(flowerId, flowerRef) {
        const section = document.getElementById('gardenCommentSection');
        const container = document.querySelector('.garden-page-container');
        if (!section) return;
        this.commentModeFlowerRef = flowerRef;
        const listEl = document.getElementById('gardenCommentList');
        if (listEl) listEl.scrollTop = 0;
        section.classList.add('visible');
        section.setAttribute('aria-hidden', 'false');
        section.dataset.flowerId = String(flowerId);
        if (container) container.classList.add('comment-section-active');
        this.commentPanelDragHeight = 400;
        this.loadAndRenderComments(flowerId);
        this.updateCommentInputAuthState();
        requestAnimationFrame(() => {
            this.centerFlowerAtTop(flowerId, flowerRef);
            this.updateCommentPanelHeight();
            this.setupCommentPanelHeightListeners();
            requestAnimationFrame(() => {
                this.setupCommentPanelDragHandle();
            });
        });
    }

    hideGardenCommentSection() {
        const section = document.getElementById('gardenCommentSection');
        const container = document.querySelector('.garden-page-container');
        if (!section) return;
        this.commentModeFlowerRef = null;
        this.removeCommentPanelHeightListeners();
        this.removeCommentPanelDragHandle();
        section.classList.remove('visible');
        section.setAttribute('aria-hidden', 'true');
        delete section.dataset.flowerId;
        if (container) container.classList.remove('comment-section-active');
    }

    /**
     * Update comment panel height - expands on scroll until 32px spacing to the question div
     */
    updateCommentPanelHeight() {
        if (this._isDraggingCommentPanel) return;
        const panelInner = document.querySelector('.garden-comment-panel .comment-panel-inner');
        const questionEl = this.commentModeFlowerRef?.wrapper?.querySelector('.question-bubble-text');
        const listEl = document.getElementById('gardenCommentList');
        if (!panelInner || !listEl) return;
        let maxHeight = window.innerHeight - 24;
        if (questionEl) {
            const questionRect = questionEl.getBoundingClientRect();
            maxHeight = Math.min(maxHeight, window.innerHeight - questionRect.bottom - 32);
        }
        maxHeight = Math.max(200, maxHeight);
        const baseHeight = Math.max(400, this.commentPanelDragHeight || 400);
        const scrollTop = listEl.scrollTop;
        const targetHeight = Math.min(baseHeight + scrollTop, maxHeight);
        panelInner.style.height = `${targetHeight}px`;
    }

    setupCommentPanelDragHandle() {
        this.removeCommentPanelDragHandle();
        const handle = document.getElementById('gardenCommentDragHandle');
        const panelInner = document.querySelector('.garden-comment-panel .comment-panel-inner');
        if (!handle || !panelInner) return;

        let startY = 0, startHeight = 0;
        const minHeight = 200;
        const getMaxHeight = () => Math.max(minHeight, window.innerHeight - 24);
        const closeThreshold = 120;

        const onPointerMove = (e) => {
            if (e.cancelable) e.preventDefault();
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const deltaY = startY - clientY;
            let newHeight = Math.round(startHeight + deltaY);
            newHeight = Math.max(minHeight, Math.min(getMaxHeight(), newHeight));
            this.commentPanelDragHeight = newHeight;
            panelInner.style.height = `${newHeight}px`;
        };

        const onPointerUp = () => {
            this._isDraggingCommentPanel = false;
            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('mouseup', onPointerUp);
            document.removeEventListener('touchmove', onPointerMove, { capture: true });
            document.removeEventListener('touchend', onPointerUp, { capture: true });
            const h = parseFloat(panelInner.style.height) || 400;
            if (h < closeThreshold) {
                this.hideGardenCommentSection();
            } else {
                this.updateCommentPanelHeight();
            }
        };

        const onPointerDown = (e) => {
            e.stopPropagation();
            this._isDraggingCommentPanel = true;
            startY = e.touches ? e.touches[0].clientY : e.clientY;
            startHeight = parseFloat(panelInner.style.height) || 400;
            document.addEventListener('mousemove', onPointerMove);
            document.addEventListener('mouseup', onPointerUp);
            document.addEventListener('touchmove', onPointerMove, { passive: false, capture: true });
            document.addEventListener('touchend', onPointerUp, { once: true, capture: true });
        };

        const onMouseDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            onPointerDown(e);
        };
        const onTouchStart = (e) => {
            e.stopPropagation();
            onPointerDown(e);
        };
        handle.addEventListener('mousedown', onMouseDown, { capture: true });
        handle.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
        this._commentDragHandleCleanup = () => {
            handle.removeEventListener('mousedown', onMouseDown, { capture: true });
            handle.removeEventListener('touchstart', onTouchStart, { capture: true });
            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('mouseup', onPointerUp);
            document.removeEventListener('touchmove', onPointerMove, { capture: true });
            document.removeEventListener('touchend', onPointerUp, { capture: true });
        };
    }

    removeCommentPanelDragHandle() {
        if (typeof this._commentDragHandleCleanup === 'function') {
            this._commentDragHandleCleanup();
        }
        this._commentDragHandleCleanup = null;
    }

    setupCommentPanelHeightListeners() {
        this.removeCommentPanelHeightListeners();
        const listEl = document.getElementById('gardenCommentList');
        const boundUpdate = () => this.updateCommentPanelHeight();
        this._commentPanelScrollHandler = boundUpdate;
        this._commentPanelResizeHandler = () => this.updateCommentPanelHeight();
        if (listEl) listEl.addEventListener('scroll', boundUpdate);
        window.addEventListener('resize', this._commentPanelResizeHandler);
    }

    removeCommentPanelHeightListeners() {
        const listEl = document.getElementById('gardenCommentList');
        if (listEl && this._commentPanelScrollHandler) {
            listEl.removeEventListener('scroll', this._commentPanelScrollHandler);
        }
        if (this._commentPanelResizeHandler) {
            window.removeEventListener('resize', this._commentPanelResizeHandler);
        }
        this._commentPanelScrollHandler = null;
        this._commentPanelResizeHandler = null;
    }

    /**
     * Position the selected flower centered with question bubble top 24px from viewport top
     */
    centerFlowerAtTop(flowerId, flowerRef) {
        if (!this.canvas || !this.container) return;
        const flowerData = flowerRef?.data;
        if (!flowerData) return;
        const canvasX = flowerData.canvasX ?? 0;
        const canvasY = flowerData.canvasY ?? 0;
        const targetBubbleTop = 24; // 24px from top edge of viewport
        const rect = this.container.getBoundingClientRect();
        // Measure actual question bubble (inner div) position from DOM
        const bubbleEl = flowerRef?.wrapper?.querySelector('.garden-question-bubble');
        let offsetY;
        if (bubbleEl) {
            const bubbleRect = bubbleEl.getBoundingClientRect();
            const currentTop = bubbleRect.top;
            offsetY = this.offsetY + (targetBubbleTop - currentTop);
        } else {
            const bubbleTopInCanvas = canvasY - 320;
            offsetY = targetBubbleTop - rect.top - bubbleTopInCanvas;
        }
        this.offsetX = rect.width / 2 - canvasX;
        const maxOffset = this.canvasSize - window.innerWidth;
        const maxOffsetY = this.canvasSize - window.innerHeight;
        this.offsetX = Math.max(-maxOffset, Math.min(0, this.offsetX));
        this.offsetY = Math.max(-maxOffsetY, Math.min(0, offsetY));
        this.canvas.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px)`;
        if (this.flowers.length > 0) {
            if (this.updateVisibleFlowersThrottle) {
                clearTimeout(this.updateVisibleFlowersThrottle);
                this.updateVisibleFlowersThrottle = null;
            }
            this.updateVisibleFlowers();
            this.updateCenterFlower();
        }
    }

    /**
     * Check if we've moved to a new area and need to lazy load flowers
     */
    checkAndLazyLoad() {
        if (this.flowers.length === 0) return;
        
        // Use dynamic padding based on viewport size (20%)
        const viewportPaddingX = window.innerWidth * this.viewportPaddingPercent;
        const viewportPaddingY = window.innerHeight * this.viewportPaddingPercent;
        const currentArea = {
            x: Math.floor(-this.offsetX / (viewportPaddingX * 2)),
            y: Math.floor(-this.offsetY / (viewportPaddingY * 2))
        };

        if (!this.lastRenderedArea || 
            currentArea.x !== this.lastRenderedArea.x || 
            currentArea.y !== this.lastRenderedArea.y) {
            console.log('🌸 New area detected, lazy loading flowers...');
            this.lastRenderedArea = currentArea;
            this.throttledUpdateVisibleFlowers();
        }
    }

    /**
     * Center the view on a specific position
     */
    centerOn(x, y) {
        if (!this.canvas) {
            console.warn('🌸 Cannot center: canvas not initialized');
            return;
        }

        console.log(`🌸 centerOn called with (${x}, ${y}), current offset: (${this.offsetX}, ${this.offsetY})`);

        this.offsetX = -x + window.innerWidth / 2;
        this.offsetY = -y + window.innerHeight / 2;

        // Clamp
        const maxOffset = this.canvasSize - window.innerWidth;
        const maxOffsetY = this.canvasSize - window.innerHeight;
        this.offsetX = Math.max(-maxOffset, Math.min(0, this.offsetX));
        this.offsetY = Math.max(-maxOffsetY, Math.min(0, this.offsetY));

        console.log(`🌸 After clamp: offsetX=${this.offsetX.toFixed(0)}, offsetY=${this.offsetY.toFixed(0)}`);

        this.canvas.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px)`;
        
        // Only update visible flowers if we have flowers loaded
        // Use immediate update (not throttled) when centering to ensure flowers appear
        if (this.flowers.length > 0) {
            // Clear any pending throttled update
            if (this.updateVisibleFlowersThrottle) {
                clearTimeout(this.updateVisibleFlowersThrottle);
                this.updateVisibleFlowersThrottle = null;
            }
            // Immediate update when centering
            console.log(`🌸 Calling updateVisibleFlowers after centerOn, flowers.length=${this.flowers.length}`);
            this.updateVisibleFlowers();
        } else {
            console.warn('🌸 centerOn called but no flowers available to render');
        }
    }

    /**
     * Check if a position is too close to existing flowers
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Array} existingFlowers - Array of flowers with canvasX and canvasY
     * @param {number} minDistance - Minimum distance required
     * @returns {boolean} - True if position is too close to any existing flower
     */
    isPositionTooClose(x, y, existingFlowers, minDistance) {
        for (const flower of existingFlowers) {
            if (flower.canvasX === undefined || flower.canvasY === undefined) continue;
            
            const dx = x - flower.canvasX;
            const dy = y - flower.canvasY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < minDistance) {
                return true;
            }
        }
        return false;
    }

    /**
     * Find a valid position that maintains minimum distance from existing flowers
     * @param {number} baseX - Base X coordinate
     * @param {number} baseY - Base Y coordinate
     * @param {Array} existingFlowers - Array of flowers with canvasX and canvasY
     * @param {number} minDistance - Minimum distance required
     * @param {number} maxAttempts - Maximum attempts to find valid position
     * @returns {Object} - {x, y} valid position
     */
    findValidPosition(baseX, baseY, existingFlowers, minDistance, maxAttempts = 50) {
        // First check if base position is valid
        if (!this.isPositionTooClose(baseX, baseY, existingFlowers, minDistance)) {
            return { x: baseX, y: baseY };
        }

        // Try to find a valid position by moving away from closest flower
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Find the closest flower
            let closestFlower = null;
            let closestDistance = Infinity;
            
            for (const flower of existingFlowers) {
                if (flower.canvasX === undefined || flower.canvasY === undefined) continue;
                
                const dx = baseX - flower.canvasX;
                const dy = baseY - flower.canvasY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestFlower = flower;
                }
            }

            if (!closestFlower) {
                // No existing flowers, use base position
                return { x: baseX, y: baseY };
            }

            // Calculate direction away from closest flower
            const dx = baseX - closestFlower.canvasX;
            const dy = baseY - closestFlower.canvasY;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);
            
            if (currentDistance === 0) {
                // Same position, move in random direction
                const angle = Math.random() * Math.PI * 2;
                baseX += Math.cos(angle) * minDistance;
                baseY += Math.sin(angle) * minDistance;
            } else {
                // Move away from closest flower
                const moveDistance = minDistance - currentDistance + 10; // Add 10px buffer
                const unitX = dx / currentDistance;
                const unitY = dy / currentDistance;
                
                baseX += unitX * moveDistance;
                baseY += unitY * moveDistance;
            }

            // Check if new position is valid
            if (!this.isPositionTooClose(baseX, baseY, existingFlowers, minDistance)) {
                return { x: baseX, y: baseY };
            }

            // Ensure position stays within canvas bounds
            baseX = Math.max(0, Math.min(this.canvasSize, baseX));
            baseY = Math.max(0, Math.min(this.canvasSize, baseY));
        }

        // If we couldn't find a valid position, return the last attempted position
        // This should rarely happen, but ensures we don't get stuck
        console.warn(`🌸 Could not find valid position after ${maxAttempts} attempts, using last position`);
        return { x: baseX, y: baseY };
    }

    /**
     * Generate a deterministic position for a flower
     * Flowers with questions get isolated spacing, others get dense spacing
     * Now includes collision detection to ensure minimum distance
     */
    getFlowerPosition(index, seed, hasQuestion = false, existingFlowers = []) {
        const random = this.seededRandom(seed + index);
        const random2 = this.seededRandom(seed + index + 1000);

        // Use different spread based on whether flower shows question
        const spread = hasQuestion ? this.isolatedSpread : this.denseSpread;
        
        // Arrange flowers in a spiral-like pattern from center
        const angle = index * 137.5 * (Math.PI / 180); // Golden angle
        const radius = Math.sqrt(index) * spread;

        // Add some randomness (kept modest to respect minFlowerDistance)
        const jitterAmount = hasQuestion ? 40 : 50;
        const jitterX = (random - 0.5) * jitterAmount;
        const jitterY = (random2 - 0.5) * jitterAmount;

        const centerX = this.canvasSize / 2;
        const centerY = this.canvasSize / 2;

        const baseX = centerX + Math.cos(angle) * radius + jitterX;
        const baseY = centerY + Math.sin(angle) * radius + jitterY;

        // Find valid position that maintains minimum distance
        return this.findValidPosition(baseX, baseY, existingFlowers, this.minFlowerDistance);
    }

    /**
     * Seeded random number generator
     */
    seededRandom(seed) {
        const x = Math.sin(seed * 9999) * 10000;
        return x - Math.floor(x);
    }

    /**
     * Throttled version of updateVisibleFlowers to reduce lag
     * Only updates every updateVisibleFlowersDelay ms
     */
    throttledUpdateVisibleFlowers() {
        if (this.updateVisibleFlowersThrottle) {
            clearTimeout(this.updateVisibleFlowersThrottle);
        }
        
        this.updateVisibleFlowersThrottle = setTimeout(() => {
            this.updateVisibleFlowers();
            this.updateVisibleFlowersThrottle = null;
        }, this.updateVisibleFlowersDelay);
    }

    /**
     * Final verification pass to ensure no flowers overlap
     * Adjusts positions if any flowers are too close
     */
    ensureNoOverlaps(flowers) {
        let adjustmentsMade = 0;
        
        for (let i = 0; i < flowers.length; i++) {
            const flower1 = flowers[i];
            if (!flower1.canvasX || !flower1.canvasY) continue;
            
            for (let j = i + 1; j < flowers.length; j++) {
                const flower2 = flowers[j];
                if (!flower2.canvasX || !flower2.canvasY) continue;
                
                const dx = flower1.canvasX - flower2.canvasX;
                const dy = flower1.canvasY - flower2.canvasY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < this.minFlowerDistance) {
                    // Flowers are too close, adjust position
                    const adjustment = this.minFlowerDistance - distance + 5; // Add 5px buffer
                    const angle = Math.atan2(dy, dx);
                    
                    // Move flower2 away from flower1
                    flower2.canvasX += Math.cos(angle) * adjustment;
                    flower2.canvasY += Math.sin(angle) * adjustment;
                    
                    // Ensure position stays within canvas bounds
                    flower2.canvasX = Math.max(0, Math.min(this.canvasSize, flower2.canvasX));
                    flower2.canvasY = Math.max(0, Math.min(this.canvasSize, flower2.canvasY));
                    
                    adjustmentsMade++;
                    console.log(`🌸 Adjusted flower ${flower2.id} position to maintain ${this.minFlowerDistance}px minimum distance`);
                }
            }
        }
        
        if (adjustmentsMade > 0) {
            console.log(`🌸 Made ${adjustmentsMade} position adjustments to prevent overlaps`);
        }
    }

    /**
     * Compute overlap area of two circles (radii r1, r2; center distance d)
     * Used to enforce max 30% overlap with other flowers
     */
    circleOverlapArea(r1, r2, d) {
        if (d >= r1 + r2) return 0;
        if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
        const d2 = d * d;
        const part = 4 * d2 * (r1 * r1 + r2 * r2) - d2 * d2 - Math.pow(r1 * r1 - r2 * r2, 2);
        if (part <= 0) return 0;
        return r1 * r1 * Math.acos((d2 + r1 * r1 - r2 * r2) / (2 * d * r1)) +
               r2 * r2 * Math.acos((d2 + r2 * r2 - r1 * r1) / (2 * d * r2)) -
               0.5 * Math.sqrt(part);
    }

    /**
     * Check if ghost at (x,y) would overlap >30% with any real flower or other ghost
     */
    isGhostPositionValid(x, y, existingGhosts) {
        const gR = this.ghostFlowerRadius;
        const rR = this.realFlowerRadius;
        const maxOverlapReal = 0.3 * Math.PI * rR * rR;
        const maxOverlapGhost = 0.3 * Math.PI * gR * gR;
        for (const f of this.flowers) {
            if (f.canvasX == null || f.canvasY == null) continue;
            const d = Math.hypot(x - f.canvasX, y - f.canvasY);
            if (d < this.minGhostToReal) return false;
            const overlap = this.circleOverlapArea(gR, rR, d);
            if (overlap > maxOverlapReal) return false;
        }
        for (const g of existingGhosts) {
            const d = Math.hypot(x - g.canvasX, y - g.canvasY);
            if (d < this.minGhostToGhost) return false;
            const overlap = this.circleOverlapArea(gR, gR, d);
            if (overlap > maxOverlapGhost) return false;
        }
        return true;
    }

    /**
     * Generate ghost flower positions in empty gaps between real flowers.
     * Uses region around the VIEW CENTER (where user will look) so ghosts are visible on load.
     * @param {number} [viewCenterX] - X of view center (e.g. newest flower); falls back to flower bounding box center
     * @param {number} [viewCenterY] - Y of view center
     */
    generateGhostFlowers(viewCenterX, viewCenterY) {
        this.ghostFlowers = [];
        if (this.flowers.length === 0) return;
        const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
        const extend = Math.max(vw, vh) * 1.2;
        let minX = this.canvasSize, maxX = 0, minY = this.canvasSize, maxY = 0;
        for (const f of this.flowers) {
            if (f.canvasX == null || f.canvasY == null) continue;
            minX = Math.min(minX, f.canvasX);
            maxX = Math.max(maxX, f.canvasX);
            minY = Math.min(minY, f.canvasY);
            maxY = Math.max(maxY, f.canvasY);
        }
        if (maxX < minX) minX = maxX = this.canvasSize / 2;
        if (maxY < minY) minY = maxY = this.canvasSize / 2;
        minX = Math.max(0, minX - extend);
        maxX = Math.min(this.canvasSize, maxX + extend);
        minY = Math.max(0, minY - extend);
        maxY = Math.min(this.canvasSize, maxY + extend);
        // Use view center (where we'll pan to) so ghosts appear on initial load
        const centerX = (typeof viewCenterX === 'number' && typeof viewCenterY === 'number')
            ? viewCenterX : (minX + maxX) / 2;
        const centerY = (typeof viewCenterX === 'number' && typeof viewCenterY === 'number')
            ? viewCenterY : (minY + maxY) / 2;
        const ghostSpread = 170;
        const ghostJitter = 90;
        const ghostSeed = 0.42;
        let id = 0;
        const maxCandidates = this.maxGhostFlowers * 6;
        for (let i = 0; i < maxCandidates && this.ghostFlowers.length < this.maxGhostFlowers; i++) {
            const random = this.seededRandom(ghostSeed + i);
            const random2 = this.seededRandom(ghostSeed + i + 1000);
            const angle = i * 137.5 * (Math.PI / 180);
            const radius = Math.sqrt(i) * ghostSpread;
            const jitterX = (random - 0.5) * ghostJitter;
            const jitterY = (random2 - 0.5) * ghostJitter;
            const baseX = centerX + Math.cos(angle) * radius + jitterX;
            const baseY = centerY + Math.sin(angle) * radius + jitterY;
            const x = Math.max(0, Math.min(this.canvasSize, baseX));
            const y = Math.max(0, Math.min(this.canvasSize, baseY));
            if (!this.isGhostPositionValid(x, y, this.ghostFlowers)) continue;
            this.ghostFlowers.push({ id: `ghost-${id++}`, canvasX: x, canvasY: y });
        }
        console.log(`🌸 Generated ${this.ghostFlowers.length} ghost flowers`);
    }

    /**
     * Load flowers from database (limited number)
     */
    async loadAllFlowers() {
        if (this.isLoading) {
            console.log('🌸 Already loading flowers, skipping...');
            return;
        }
        this.isLoading = true;

        console.log('🌸 Loading flowers from database...');
        console.log('🌸 maxFlowersToShow:', this.maxFlowersToShow);

        try {
            // Load from database (limited)
            let dbFlowers = [];
            if (typeof flowerDB !== 'undefined') {
                try {
                    await flowerDB.init();
                    // Load more flowers to ensure we get the newly created one
                    dbFlowers = await flowerDB.getAllFlowers({ offset: 0, limit: this.maxFlowersToShow + 10 });
                    console.log('🌸 Loaded flowers from database:', dbFlowers.length);
                    if (dbFlowers.length > 0) {
                        console.log('🌸 Database flower IDs:', dbFlowers.slice(0, 5).map(f => f.id));
                        console.log('🌸 Looking for:', window.lastCreatedFlowerId);
                        const found = dbFlowers.find(f => {
                            const id = String(f.id);
                            const targetId = String(window.lastCreatedFlowerId);
                            return id === targetId || id === window.lastCreatedFlowerId;
                        });
                        console.log('🌸 Newly created flower found in database:', found ? 'YES' : 'NO');
                    }
                } catch (dbError) {
                    console.error('🌸 Error loading from database:', dbError);
                    console.error('🌸 Error details:', dbError.message, dbError.stack);
                    dbFlowers = [];
                }
            } else {
                console.warn('🌸 flowerDB is undefined');
            }

            // Use ONLY database flowers - no mock flowers
            const positionedFlowers = [];
            
            const dbFlowersWithPositions = dbFlowers.map((flower, index) => {
                // Database flowers with questions show question bubbles (first 10 for performance)
                // Always show question for the newly created flower (matches lastCreatedFlowerId)
                const isNewlyCreated = window.lastCreatedFlowerId && 
                    (String(flower.id) === String(window.lastCreatedFlowerId));
                const showsQuestion = !!(flower.question) && (index < 10 || isNewlyCreated);
                const pos = this.getFlowerPosition(index, flower.seed || index, showsQuestion, positionedFlowers);
                
                const positionedFlower = {
                    ...flower,
                    canvasX: pos.x,
                    canvasY: pos.y,
                    showsQuestion: showsQuestion
                };
                
                positionedFlowers.push(positionedFlower);
                return positionedFlower;
            });

            // Final verification: ensure no overlaps exist
            this.ensureNoOverlaps(dbFlowersWithPositions);
            
            this.flowers = dbFlowersWithPositions.slice(0, this.maxFlowersToShow);

            // Compute view center BEFORE generating ghosts so they appear where we'll look
            let ghostCenterX, ghostCenterY;
            if (window.lastCreatedFlowerId) {
                const targetFlower = this.findFlowerById(window.lastCreatedFlowerId);
                if (targetFlower && targetFlower.canvasX != null && targetFlower.canvasY != null) {
                    ghostCenterX = targetFlower.canvasX;
                    ghostCenterY = targetFlower.canvasY;
                }
            }
            if (ghostCenterX == null && this.flowers.length > 0 && this.flowers[0].canvasX != null) {
                ghostCenterX = this.flowers[0].canvasX;
                ghostCenterY = this.flowers[0].canvasY;
            }
            if (ghostCenterX == null) {
                ghostCenterX = this.canvasSize / 2;
                ghostCenterY = this.canvasSize / 2;
            }
            this.generateGhostFlowers(ghostCenterX, ghostCenterY);

            console.log(`🌸 Total flowers in array: ${this.flowers.length} (database only)`);
            console.log(`🌸 About to check if flowers.length === 0, current length: ${this.flowers.length}`);
            
            // CRITICAL: Hide empty state immediately if we have flowers
            if (this.flowers.length > 0) {
                console.log('🌸 We have flowers! Hiding empty state immediately...');
                try {
                    this.hideEmptyState();
                    console.log('🌸 Empty state hidden (early)');
                } catch (earlyHideError) {
                    console.error('🌸 Error hiding empty state early:', earlyHideError);
                }
            }
            
            if (this.flowers.length === 0) {
                console.log('🌸 No flowers in database - will show empty state');
            } else {
                console.log('🌸 Entering else block (flowers.length > 0)');
                console.log(`🌸 First few flower IDs:`, this.flowers.slice(0, 5).map(f => f.id));
                console.log(`🌸 First flower position:`, this.flowers[0] ? `(${this.flowers[0].canvasX}, ${this.flowers[0].canvasY})` : 'none');
                console.log(`🌸 First flower has position data:`, this.flowers[0] ? 
                    `canvasX=${this.flowers[0].canvasX}, canvasY=${this.flowers[0].canvasY}` : 'NO');
                
                // Validate all flowers have positions
                const flowersWithoutPositions = this.flowers.filter(f => !f.canvasX || !f.canvasY);
                if (flowersWithoutPositions.length > 0) {
                    console.warn(`🌸 ${flowersWithoutPositions.length} flowers missing position data:`, flowersWithoutPositions.map(f => f.id));
                }
            }

            // Render visible flowers - CRITICAL: Always hide empty state if we have flowers
            console.log(`🌸 About to check flowers.length: ${this.flowers.length}`);
            if (this.flowers.length === 0) {
                console.error('🌸 ERROR: No flowers loaded! Showing empty state.');
                this.showEmptyState();
            } else {
                console.log(`🌸 ${this.flowers.length} flowers ready to display - hiding empty state`);
                try {
                    this.hideEmptyState();
                    console.log('🌸 Empty state hidden successfully');
                } catch (hideError) {
                    console.error('🌸 Error hiding empty state:', hideError);
                }
                
                // Center on newest flower or newly created flower
                let centerX, centerY;
                if (window.lastCreatedFlowerId) {
                    const targetFlower = this.findFlowerById(window.lastCreatedFlowerId);
                    if (targetFlower) {
                        console.log('🌸 Centering on newly created flower:', targetFlower.id);
                        centerX = targetFlower.canvasX;
                        centerY = targetFlower.canvasY;
                        window.lastCreatedFlowerId = null; // Clear after centering
                    } else {
                        console.log('🌸 Newly created flower not found, centering on newest');
                        const newest = this.flowers[0];
                        if (newest && newest.canvasX && newest.canvasY) {
                            centerX = newest.canvasX;
                            centerY = newest.canvasY;
                        } else {
                            console.warn('🌸 Newest flower missing position, using canvas center');
                            centerX = this.canvasSize / 2;
                            centerY = this.canvasSize / 2;
                        }
                    }
                } else if (this.flowers.length > 0) {
                    const newest = this.flowers[0];
                    if (newest && newest.canvasX && newest.canvasY) {
                        console.log(`🌸 Centering on newest flower at (${newest.canvasX}, ${newest.canvasY})`);
                        centerX = newest.canvasX;
                        centerY = newest.canvasY;
                    } else {
                        console.warn('🌸 Newest flower missing position, using canvas center');
                        centerX = this.canvasSize / 2;
                        centerY = this.canvasSize / 2;
                    }
                } else {
                    console.warn('🌸 No flowers available, centering on canvas middle');
                    centerX = this.canvasSize / 2;
                    centerY = this.canvasSize / 2;
                }
                
                // Center and then force update visible flowers
                console.log(`🌸 Centering on (${centerX}, ${centerY})`);
                try {
                    this.centerOn(centerX, centerY);
                    console.log('🌸 CenterOn completed');
                    
                    // Force immediate render of visible flowers (don't wait for lazy loading)
                    // centerOn already calls updateVisibleFlowers immediately, but add a small delay
                    // to ensure DOM is ready
                    setTimeout(() => {
                        console.log('🌸 Force updating visible flowers after centering...');
                        try {
                            // Clear any pending throttled update
                            if (this.updateVisibleFlowersThrottle) {
                                clearTimeout(this.updateVisibleFlowersThrottle);
                                this.updateVisibleFlowersThrottle = null;
                            }
                            // Immediate update
                            this.updateVisibleFlowers();
                            console.log(`🌸 updateVisibleFlowers completed: ${this.loadedFlowers.size} flowers rendered`);
                        } catch (updateError) {
                            console.error('🌸 Error in updateVisibleFlowers:', updateError);
                            console.error('🌸 Error stack:', updateError.stack);
                        }
                    }, 100);
                } catch (centerError) {
                    console.error('🌸 Error in centerOn:', centerError);
                }
            }

        } catch (error) {
            console.error('🌸 Error loading flowers:', error);
            console.error('🌸 Error stack:', error.stack);
            this.flowers = [];
            this.showEmptyState();
        }

        this.isLoading = false;
        const finalCount = this.flowers.length;
        console.log(`🌸 loadAllFlowers complete. Final flowers count: ${finalCount}`);
        
        if (finalCount === 0) {
            console.error('🌸 CRITICAL: loadAllFlowers completed with ZERO flowers!');
        } else {
            console.log('🌸 Flowers successfully loaded and ready');
        }
    }

    /**
     * Find flower by ID (handles string/number conversion)
     */
    findFlowerById(flowerId) {
        if (!flowerId) return null;
        
        // Try exact match first
        let flower = this.flowers.find(f => f.id === flowerId);
        if (flower) return flower;
        
        // Try string conversion
        const idStr = String(flowerId);
        flower = this.flowers.find(f => String(f.id) === idStr);
        if (flower) return flower;
        
        // Try number conversion
        const idNum = Number(flowerId);
        if (!isNaN(idNum)) {
            flower = this.flowers.find(f => Number(f.id) === idNum);
            if (flower) return flower;
        }
        
        return null;
    }

    /**
     * Update which flowers are visible and render/hide accordingly (lazy loading)
     * Optimized to only render flowers within screen + 20% padding area
     */
    updateVisibleFlowers() {
        if (!this.canvas) {
            console.warn('🌸 Cannot update visible flowers: canvas not initialized');
            return;
        }

        if (this.flowers.length === 0) {
            console.warn('🌸 No flowers to display');
            return;
        }

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const viewportPaddingX = viewportWidth * this.viewportPaddingPercent;
        const viewportPaddingY = viewportHeight * this.viewportPaddingPercent;
        
        // Calculate visible area bounds
        const viewportLeft = -this.offsetX - viewportPaddingX;
        const viewportTop = -this.offsetY - viewportPaddingY;
        const viewportRight = viewportLeft + viewportWidth + viewportPaddingX * 2;
        const viewportBottom = viewportTop + viewportHeight + viewportPaddingY * 2;

        // Debug: Log viewport info on first call or if no flowers visible
        if (this.loadedFlowers.size === 0 || this.flowers.length > 0) {
            console.log(`🌸 updateVisibleFlowers: offsetX=${this.offsetX.toFixed(0)}, offsetY=${this.offsetY.toFixed(0)}`);
            console.log(`🌸 Viewport bounds: L=${viewportLeft.toFixed(0)}, T=${viewportTop.toFixed(0)}, R=${viewportRight.toFixed(0)}, B=${viewportBottom.toFixed(0)}`);
            if (this.flowers.length > 0) {
                console.log(`🌸 First flower position: (${this.flowers[0].canvasX}, ${this.flowers[0].canvasY})`);
            }
        }

        // Track which flowers should be visible
        const visibleIds = new Set();
        let visibleCount = 0;
        
        // Sort flowers by distance from viewport center for priority rendering
        const viewportCenterX = -this.offsetX + viewportWidth / 2;
        const viewportCenterY = -this.offsetY + viewportHeight / 2;
        
        const flowersWithDistance = this.flowers
            .filter(flower => flower.canvasX !== undefined && flower.canvasY !== undefined)
            .map(flower => {
                const dx = flower.canvasX - viewportCenterX;
                const dy = flower.canvasY - viewportCenterY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                return { flower, distance };
            })
            .sort((a, b) => a.distance - b.distance); // Closest first

        // Process flowers: only render those within viewport (terminate when out, reload on return)
        // Prioritize closest flowers if we're at the limit
        let renderedCount = 0;
        
        // CRITICAL: If no flowers are currently rendered, force render at least the closest ones
        // This ensures flowers always appear on initial load
        const forceRender = this.loadedFlowers.size === 0 && this.flowers.length > 0;
        
        for (const { flower, distance } of flowersWithDistance) {
            const isVisible = (
                flower.canvasX >= viewportLeft &&
                flower.canvasX <= viewportRight &&
                flower.canvasY >= viewportTop &&
                flower.canvasY <= viewportBottom
            );
            
            // Debug: Log first few flowers visibility check
            if (visibleCount < 3) {
                console.log(`🌸 Flower ${flower.id} at (${flower.canvasX.toFixed(0)}, ${flower.canvasY.toFixed(0)}): visible=${isVisible}, distance=${distance.toFixed(0)}`);
            }

            // If forcing render and this is one of the closest flowers, render it even if outside viewport
            const shouldForceRender = forceRender && renderedCount < this.minRenderedFlowers;
            
            if (isVisible || shouldForceRender) {
                visibleIds.add(flower.id);
                visibleCount++;

                // Render if not already rendered (lazy loading)
                const existingFlower = this.loadedFlowers.get(flower.id);
                if (!existingFlower) {
                    // Check if we've reached the maximum rendered flowers limit
                    // But always allow rendering if we have fewer than minimum flowers (ensures flowers show)
                    const shouldRender = this.loadedFlowers.size < this.maxRenderedFlowers || 
                                       this.loadedFlowers.size < this.minRenderedFlowers ||
                                       shouldForceRender;
                    
                    if (!shouldRender) {
                        // Skip rendering this flower if we're at the limit
                        // (it will be rendered when closer flowers are unloaded)
                        continue;
                    }
                    
                    renderedCount++;
                    // Create a plain object copy to avoid readonly property errors
                    const flowerCopy = {
                        id: flower.id,
                        question: flower.question,
                        answer: flower.answer,
                        numPetals: flower.numPetals,
                        petalRadius: flower.petalRadius,
                        discSize: flower.discSize,
                        seed: flower.seed,
                        timestamp: flower.timestamp,
                        canvasX: flower.canvasX,
                        canvasY: flower.canvasY,
                        showsQuestion: flower.showsQuestion
                    };
                    this.renderFlower(flowerCopy);
                } else if (existingFlower.wrapper) {
                    // Ensure wrapper is always visible
                    if (!existingFlower.wrapper.parentNode) {
                        // Wrapper was removed, re-render
                        console.log(`🌸 Flower ${flower.id} wrapper missing from DOM, re-rendering`);
                        this.loadedFlowers.delete(flower.id);
                        const flowerCopy = {
                            id: flower.id,
                            question: flower.question,
                            answer: flower.answer,
                            numPetals: flower.numPetals,
                            petalRadius: flower.petalRadius,
                            discSize: flower.discSize,
                            seed: flower.seed,
                            timestamp: flower.timestamp,
                            canvasX: flower.canvasX,
                            canvasY: flower.canvasY,
                            showsQuestion: flower.showsQuestion
                        };
                        this.renderFlower(flowerCopy);
                    } else {
                        // Ensure visibility
                        existingFlower.wrapper.style.visibility = 'visible';
                        existingFlower.wrapper.style.opacity = '1';
                        existingFlower.wrapper.style.display = 'block';
                        
                        // If not rendered, try to verify and retry if needed
                        if (!existingFlower.rendered) {
                            console.log(`🌸 Flower ${flower.id} wrapper exists but not rendered, checking status`);
                            const containerId = `gardenFlower_${flower.id}`;
                            const containerElement = document.getElementById(containerId);
                            if (!containerElement || !existingFlower.instance) {
                                // Flower failed to render, remove and retry
                                console.log(`🌸 Flower ${flower.id} failed to render, retrying...`);
                                if (existingFlower.wrapper.parentNode) {
                                    existingFlower.wrapper.remove();
                                }
                                this.loadedFlowers.delete(flower.id);
                                const flowerCopy = {
                                    id: flower.id,
                                    question: flower.question,
                                    answer: flower.answer,
                                    numPetals: flower.numPetals,
                                    petalRadius: flower.petalRadius,
                                    discSize: flower.discSize,
                                    seed: flower.seed,
                                    timestamp: flower.timestamp,
                                    canvasX: flower.canvasX,
                                    canvasY: flower.canvasY,
                                    showsQuestion: flower.showsQuestion
                                };
                                this.renderFlower(flowerCopy);
                            }
                        }
                    }
                }
            }
        }

        // Terminate flowers outside viewport immediately (reload when user returns)
        let removedCount = 0;
        this.loadedFlowers.forEach((data, id) => {
            if (!visibleIds.has(id)) {
                this.removeFlower(id);
                removedCount++;
            }
        });

        // Ghost flowers: render when in viewport (use generous 25% padding for preloading)
        const visibleGhostIds = new Set();
        const ghostPaddingX = viewportWidth * 0.25;
        const ghostPaddingY = viewportHeight * 0.25;
        const ghostViewportLeft = viewportLeft - ghostPaddingX;
        const ghostViewportRight = viewportRight + ghostPaddingX;
        const ghostViewportTop = viewportTop - ghostPaddingY;
        const ghostViewportBottom = viewportBottom + ghostPaddingY;
        if (this.ghostFlowers.length > 0) {
            for (const ghost of this.ghostFlowers) {
                const inView = ghost.canvasX >= ghostViewportLeft && ghost.canvasX <= ghostViewportRight &&
                    ghost.canvasY >= ghostViewportTop && ghost.canvasY <= ghostViewportBottom;
                if (inView) {
                    visibleGhostIds.add(ghost.id);
                    const ref = this.loadedGhostFlowers.get(ghost.id);
                    if (!ref || !ref.wrapper || !ref.wrapper.parentNode) {
                        if (ref) this.loadedGhostFlowers.delete(ghost.id);
                        this.renderGhostFlower(ghost);
                    } else {
                        ref.wrapper.style.visibility = 'visible';
                        ref.wrapper.style.opacity = '1';
                    }
                }
            }
            const ghostIdsToRemove = [];
            this.loadedGhostFlowers.forEach((ref, id) => {
                if (!visibleGhostIds.has(id)) ghostIdsToRemove.push(id);
            });
            ghostIdsToRemove.forEach(id => this.removeGhostFlower(id));
        }
        
        if (visibleCount > 0 || removedCount > 0 || renderedCount > 0) {
            console.log(`🌸 Viewport: ${visibleCount} visible, ${this.loadedFlowers.size} rendered (max: ${this.maxRenderedFlowers}), ${renderedCount} loaded, ${removedCount} terminated, ${visibleGhostIds.size} ghost flowers`);
        }
        
        // Recovery: If viewport doesn't overlap any flowers, re-center to fix offset drift
        if (visibleCount === 0 && this.flowers.length > 0) {
            console.warn(`🌸 WARNING: No flowers visible but ${this.flowers.length} flowers exist - re-centering on flowers`);
            const target = this.flowers.find(f => f.canvasX != null && f.canvasY != null) || this.flowers[0];
            if (target && target.canvasX != null && target.canvasY != null) {
                this.centerOn(target.canvasX, target.canvasY);
                return; // centerOn calls updateVisibleFlowers; avoid double update
            }
        }

        // Update center flower for question bubble
        this.updateCenterFlower();
        // Update particles around newest flower
        this.updateGardenParticles();
        // Lazy grass: only on flower showing question + 3 closest to it (not all in viewport)
        const focalId = this.centerFlowers[0] || null;
        const focalRef = focalId ? this.loadedFlowers.get(focalId) : null;
        if (!focalId || !focalRef || !focalRef.data) {
            this.loadedFlowers.forEach((ref) => {
                const disc = ref.wrapper?.querySelector('.flower-disc');
                if (disc) this.removeAnswerFromDisc(disc);
            });
            return;
        }
        const fx = focalRef.data.canvasX;
        const fy = focalRef.data.canvasY;
        const candidateIds = new Set(visibleIds);
        candidateIds.add(focalId);
        const withDist = Array.from(candidateIds)
            .map(id => ({ id, ref: this.loadedFlowers.get(id) }))
            .filter(o => o.ref && o.ref.data)
            .map(o => ({
                id: o.id,
                ref: o.ref,
                dist: Math.hypot(o.ref.data.canvasX - fx, o.ref.data.canvasY - fy)
            }))
            .sort((a, b) => a.dist - b.dist);
        const grassIds = new Set(withDist.slice(0, 4).map(o => o.id)); // focal + 3 closest
        this.loadedFlowers.forEach((ref, id) => {
            const hasGrass = ref.wrapper && ref.wrapper.querySelector('.garden-grass-layer');
            if (grassIds.has(id)) {
                if (!hasGrass && ref.wrapper && ref.wrapper.isConnected) {
                    this.scheduleGrassGrowth(ref.wrapper, id === focalId);
                }
            } else {
                if (hasGrass && ref.wrapper) {
                    ref.wrapper.querySelectorAll('.garden-grass-layer').forEach(el => el.remove());
                }
            }
        });
    }

    /**
     * Render a single flower on the canvas
     */
    renderFlower(flowerData) {
        if (!this.canvas) return;
        if (!flowerData.canvasX || !flowerData.canvasY) return;

        // Create a plain object copy to avoid readonly property errors
        // Extract all needed values first before any DOM manipulation
        const flowerId = String(flowerData.id || 'unknown');
        const canvasX = Number(flowerData.canvasX);
        const canvasY = Number(flowerData.canvasY);
        const seed = flowerData.seed || Math.random();
        // Clamp numPetals to valid range: 12-30
        const requestedPetals = flowerData.numPetals || 20;
        const numPetals = Math.max(12, Math.min(30, Math.floor(requestedPetals)));
        if (requestedPetals !== numPetals) {
            console.warn(`🌸 Flower ${flowerId}: Petal count clamped from ${requestedPetals} to ${numPetals} (valid range: 12-30)`);
        }
        const petalRadius = flowerData.petalRadius || 88;
        const discSize = flowerData.discSize || 120;
        const question = flowerData.question || '';
        const answer = flowerData.answer || '';
        const showsQuestion = flowerData.showsQuestion || false;
        const timestamp = flowerData.timestamp || Date.now();

        // Create a plain copy for storage
        const flowerDataCopy = {
            id: flowerId,
            question: question,
            answer: answer,
            numPetals: numPetals,
            petalRadius: petalRadius,
            discSize: discSize,
            seed: seed,
            timestamp: timestamp,
            canvasX: canvasX,
            canvasY: canvasY,
            showsQuestion: showsQuestion
        };

        // Create flower wrapper
        const flowerWrapper = document.createElement('div');
        flowerWrapper.className = 'garden-flower-wrapper';
        flowerWrapper.dataset.flowerId = flowerId;
        flowerWrapper.id = `flower-wrapper-${flowerId}`;
        flowerWrapper.style.position = 'absolute';
        flowerWrapper.style.left = `${canvasX}px`;
        flowerWrapper.style.top = `${canvasY}px`;
        flowerWrapper.style.transform = 'translate(-50%, -50%) scale(0)';
        flowerWrapper.style.width = '400px';
        flowerWrapper.style.height = '400px';
        flowerWrapper.style.visibility = 'visible';
        flowerWrapper.style.opacity = '1';
        flowerWrapper.style.display = 'block';
        // Set z-index based on y position: higher y = lower on screen = higher z-index = in front
        // Use canvasY directly as z-index (higher values = in front)
        flowerWrapper.style.zIndex = Math.floor(canvasY);

        // Create flower container
        const flowerContainer = document.createElement('div');
        flowerContainer.className = 'garden-flower-container';
        flowerContainer.id = `gardenFlower_${flowerId}`;
        flowerContainer.style.width = '400px';
        flowerContainer.style.height = '400px';
        flowerContainer.style.position = 'relative';
        flowerContainer.style.visibility = 'visible';
        flowerContainer.style.opacity = '1';

        // Create SVG for stem
        const stemSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        stemSVG.setAttribute('class', 'stem-svg');
        stemSVG.setAttribute('id', `gardenStemSVG_${flowerId}`);
        stemSVG.setAttribute('width', '400');
        stemSVG.setAttribute('height', '400');
        stemSVG.setAttribute('viewBox', '0 0 400 400');
        stemSVG.setAttribute('style', 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;');

        const stemPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        stemPath.setAttribute('class', 'stem-path');
        stemPath.setAttribute('id', `gardenStemPath_${flowerId}`);
        stemSVG.appendChild(stemPath);
        flowerContainer.appendChild(stemSVG);

        flowerWrapper.appendChild(flowerContainer);
        this.canvas.appendChild(flowerWrapper);
        /* Grass added lazily in updateVisibleFlowers (only for flowers in core viewport) */

        // Store reference placeholder with plain copy
        const flowerRef = {
            instance: null,
            data: flowerDataCopy,
            wrapper: flowerWrapper,
            rendered: false // Track if flower successfully rendered
        };
        this.loadedFlowers.set(flowerId, flowerRef);

        // Ensure wrapper is visible immediately
        flowerWrapper.style.visibility = 'visible';
        flowerWrapper.style.opacity = '1';
        flowerWrapper.style.display = 'block';

        // Wait for DOM to be ready before creating flower component
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const containerId = `gardenFlower_${flowerId}`;
                const stemSVGId = `gardenStemSVG_${flowerId}`;
                const stemPathId = `gardenStemPath_${flowerId}`;
                
                // Verify container exists before creating FlowerComponent
                const containerElement = document.getElementById(containerId);
                const stemSVGElement = document.getElementById(stemSVGId);
                const stemPathElement = document.getElementById(stemPathId);
                
                if (!containerElement) {
                    console.error(`🌸 ERROR: Container element '${containerId}' not found for flower ${flowerId}`);
                    console.error(`🌸 Available containers:`, Array.from(document.querySelectorAll('.garden-flower-container')).map(el => el.id));
                    // Remove the flower wrapper if it failed to render
                    if (flowerWrapper.parentNode) {
                        flowerWrapper.remove();
                    }
                    this.loadedFlowers.delete(flowerId);
                    return;
                }
                
                if (!stemSVGElement) {
                    console.error(`🌸 ERROR: Stem SVG '${stemSVGId}' not found for flower ${flowerId}`);
                    // Remove the flower wrapper if it failed to render
                    if (flowerWrapper.parentNode) {
                        flowerWrapper.remove();
                    }
                    this.loadedFlowers.delete(flowerId);
                    return;
                }
                
                if (!stemPathElement) {
                    console.error(`🌸 ERROR: Stem path '${stemPathId}' not found for flower ${flowerId}`);
                    // Remove the flower wrapper if it failed to render
                    if (flowerWrapper.parentNode) {
                        flowerWrapper.remove();
                    }
                    this.loadedFlowers.delete(flowerId);
                    return;
                }
                
                const originalTransform = flowerWrapper.style.transform;
                flowerWrapper.style.transform = 'translate(-50%, -50%) scale(1)';
                
                // CRITICAL: Check if container already has a flower instance
                // If it does, clean it up first to prevent duplicate discs/petals
                const existingDiscs = containerElement.querySelectorAll('.flower-disc');
                const existingPetals = containerElement.querySelectorAll('.flower-petal');
                
                if (existingDiscs.length > 0 || existingPetals.length > 0) {
                    console.warn(`🌸 Container ${containerId} already has flower elements (${existingDiscs.length} discs, ${existingPetals.length} petals), cleaning up...`);
                    existingDiscs.forEach(disc => disc.remove());
                    existingPetals.forEach(petal => petal.remove());
                }
                
                // CRITICAL: If there's already an instance stored, clean it up
                if (flowerRef.instance) {
                    console.warn(`🌸 Flower ${flowerId} already has an instance, cleaning up before creating new one`);
                    if (flowerRef.instance.cleanupExistingElements) {
                        flowerRef.instance.cleanupExistingElements();
                    }
                    if (flowerRef.instance.animationFrameId) {
                        cancelAnimationFrame(flowerRef.instance.animationFrameId);
                    }
                }
                
                // Create flower component using extracted values
                const flowerInstance = new FlowerComponent({
                    containerId: containerId,
                    stemSVGId: stemSVGId,
                    stemPathId: stemPathId,
                    seed: seed,
                    numPetals: numPetals,
                    petalRadius: petalRadius,
                    discSize: discSize,
                    allowDetachment: false,
                    disableInteractions: true // No disc drag, petal stretch, or swipe - only tap via container
                });

                // Verify flower component was created successfully
                if (!flowerInstance || !flowerInstance.container) {
                    console.error(`🌸 ERROR: FlowerComponent failed to initialize for flower ${flowerId}`);
                    // Remove the flower wrapper if it failed to render
                    if (flowerWrapper.parentNode) {
                        flowerWrapper.remove();
                    }
                    this.loadedFlowers.delete(flowerId);
                    return;
                }
                
                // Verify disc and petals were created correctly
                const discElement = containerElement.querySelector('.flower-disc');
                const petalElements = containerElement.querySelectorAll('.flower-petal');
                
                // CRITICAL: Verify only ONE disc exists
                const allDiscs = containerElement.querySelectorAll('.flower-disc');
                if (allDiscs.length > 1) {
                    console.error(`🌸 CRITICAL ERROR: Container ${containerId} has ${allDiscs.length} discs! Removing excess...`);
                    // Keep only the first disc, remove the rest
                    for (let i = 1; i < allDiscs.length; i++) {
                        allDiscs[i].remove();
                    }
                }
                
                // CRITICAL: Verify petal count doesn't exceed 30
                if (petalElements.length > 30) {
                    console.error(`🌸 CRITICAL ERROR: Container ${containerId} has ${petalElements.length} petals! Removing excess...`);
                    // Keep only first 30 petals
                    const excessPetals = Array.from(petalElements).slice(30);
                    excessPetals.forEach(petal => petal.remove());
                }
                
                if (!discElement) {
                    console.warn(`🌸 WARNING: Disc element not found in container for flower ${flowerId}`);
                } else if (allDiscs.length === 1) {
                    console.log(`🌸 Successfully created flower ${flowerId} with 1 disc and ${Math.min(petalElements.length, 30)} petals`);
                    
                    // Add disc tap functionality (same as original flower but without petal detachment)
                    this.setupGardenDiscTap(discElement, flowerInstance, flowerId);
                }
                
                if (petalElements.length === 0) {
                    console.warn(`🌸 WARNING: No petal elements found in container for flower ${flowerId}`);
                } else if (petalElements.length <= 30) {
                    console.log(`🌸 Successfully created flower ${flowerId} with ${petalElements.length} petals`);
                }

                flowerWrapper.style.transform = originalTransform;
                flowerRef.instance = flowerInstance;
                flowerRef.rendered = true; // Mark as successfully rendered

                // Animate growing in
                requestAnimationFrame(() => {
                    flowerWrapper.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
                    flowerWrapper.style.transform = 'translate(-50%, -50%) scale(1)';
                });
            });
        });
    }

    /**
     * Render a ghost flower (image only, no question, no grass)
     */
    renderGhostFlower(ghost) {
        if (!this.canvas || !ghost) return;
        const id = String(ghost.id);
        if (this.loadedGhostFlowers.has(id)) return;
        const s = this.ghostFlowerDisplaySize;
        const wrapper = document.createElement('div');
        wrapper.className = 'garden-flower-wrapper ghost-flower-wrapper';
        wrapper.dataset.flowerId = id;
        wrapper.id = `ghost-wrapper-${id}`;
        wrapper.style.position = 'absolute';
        wrapper.style.left = `${ghost.canvasX}px`;
        wrapper.style.top = `${ghost.canvasY}px`;
        wrapper.style.transform = 'translate(-50%, -50%) scale(0)';
        wrapper.style.width = `${s}px`;
        wrapper.style.height = `${s}px`;
        wrapper.style.pointerEvents = 'none';
        wrapper.style.zIndex = Math.floor(ghost.canvasY) - 2;
        const img = document.createElement('img');
        img.src = new URL('GHOST_FLOWER.png', window.location.href).href;
        img.alt = '';
        img.className = 'ghost-flower-image';
        img.onerror = () => {
            console.warn('🌸 Ghost flower image failed, trying GHOST FLOWER.png');
            img.onerror = () => console.error('🌸 Ghost flower image load failed');
            img.src = new URL('GHOST FLOWER.png', window.location.href).href;
        };
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        wrapper.appendChild(img);
        this.canvas.appendChild(wrapper);
        this.loadedGhostFlowers.set(id, { wrapper, data: ghost });
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                wrapper.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
                wrapper.style.transform = 'translate(-50%, -50%) scale(1)';
            });
        });
    }

    /**
     * Remove a ghost flower from the canvas
     */
    removeGhostFlower(id) {
        const ref = this.loadedGhostFlowers.get(id);
        if (!ref || !ref.wrapper) return;
        if (ref.wrapper.parentNode) ref.wrapper.remove();
        this.loadedGhostFlowers.delete(id);
    }

    /**
     * Defer grass growth to avoid blocking initial flower render (smoother loading)
     * Uses requestIdleCallback when available; staggers with random offset when many flowers load
     */
    scheduleGrassGrowth(flowerWrapper, isQuestionFlower = false) {
        const stagger = Math.random() * 60;
        const run = () => {
            if (!flowerWrapper.isConnected) return;
            this.growGrassAroundFlower(flowerWrapper, isQuestionFlower);
        };
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => setTimeout(run, stagger), { timeout: 250 });
        } else {
            setTimeout(run, 70 + stagger);
        }
    }

    /**
     * Grow grass around a flower - fewer blades, denser cluster, below stem
     * Question flower: 2x radius, more blades
     */
    growGrassAroundFlower(flowerWrapper, isQuestionFlower = false) {
        const asset = (p) => new URL(p, window.location.href).href;
        const sources = [
            { src: asset('assets/Grass-1.2.png'), cls: 'grass-1' },
            { src: asset('assets/Grass-2.2.png'), cls: 'grass-2' }
        ];
        const cx = 200;
        const stemBottom = 400; // stem ends at container bottom (script.js stemBottomY)
        const cy = stemBottom + 35; // grass center below stem; front layer base at ~420

        const radiusMult = isQuestionFlower ? 2 : 1;
        const rings = isQuestionFlower
            ? [
                { radius: 26 * radiusMult, stepDeg: 22 },
                { radius: 50 * radiusMult, stepDeg: 20 },
                { radius: 75 * radiusMult, stepDeg: 18 }
            ]
            : [
                { radius: 26, stepDeg: 45 },
                { radius: 50, stepDeg: 40 }
            ];

        const threshold = 12; // y within ±12 of stem = "same level"

        const allBlades = [];
        rings.forEach((ring) => {
            for (let deg = 0; deg < 360; deg += ring.stepDeg) {
                const rad = (deg * Math.PI) / 180;
                const x = cx + ring.radius * Math.cos(rad);
                const y = cy + ring.radius * Math.sin(rad);
                // Layer by blade bottom Y: lower Y = back (behind), higher Y = front (in front), middle Y = middle (in front of flower)
                let layer;
                if (y < stemBottom - threshold) layer = 'back';   // lower Y → behind flower
                else if (y > stemBottom + threshold) layer = 'front'; // higher Y → in front of flower
                else layer = 'middle';  // middle Y → in front of flower (between back and front)
                allBlades.push({ x, y, layer, deg });
            }
        });

        const types = this.assignGardenGrassTypes(allBlades.length);
        const heightByLayer = isQuestionFlower
            ? { back: 165, middle: 140, front: 115 }
            : { back: 135, middle: 115, front: 95 };

        const layers = { back: [], middle: [], front: [] };
        allBlades.forEach((b, i) => {
            const idx = types[i];
            const blade = document.createElement('img');
            blade.src = sources[idx].src;
            blade.alt = '';
            blade.className = `grass-blade garden-grass-blade garden-grass-${b.layer} ${sources[idx].cls}`;
            const h = heightByLayer[b.layer];
            blade.style.left = `${b.x}px`;
            blade.style.top = `${b.y - h}px`;
            blade.style.height = `${h}px`;
            blade.style.transformOrigin = 'center bottom';
            const sizeScale = 0.65 + Math.random() * 0.3;
            const tilt = (b.deg - 90) * 0.1;
            blade.style.transform = `translate(-50%, 0) scale(${sizeScale}) scaleY(0) rotate(${tilt}deg)`;
            blade.style.transitionDelay = `${0.35 + Math.random() * 0.9}s`; // staggered to reduce jank
            blade.dataset.sizeScale = sizeScale;
            blade.dataset.rotation = tilt;
            blade.dataset.bladeY = b.y;
            layers[b.layer].push({ blade, y: b.y });
        });

        if (!flowerWrapper.isConnected) return;

        // Within each layer: sort by Y ascending so lower Y (behind) first, higher Y (front) last in DOM
        ['back', 'middle', 'front'].forEach((layerName) => {
            layers[layerName].sort((a, b) => a.y - b.y);
        });

        const order = ['back', 'middle', 'front'];
        const layerDivs = order.map((layerName) => {
            const layerDiv = document.createElement('div');
            layerDiv.className = `garden-grass-layer garden-grass-layer-${layerName} garden-grass-circular-layer`;
            layerDiv.setAttribute('aria-hidden', 'true');
            layers[layerName].forEach(({ blade }) => layerDiv.appendChild(blade));
            return layerDiv;
        });

        const ref = flowerWrapper.firstChild;
        flowerWrapper.insertBefore(layerDivs[0], ref);
        flowerWrapper.appendChild(layerDivs[1]);
        flowerWrapper.appendChild(layerDivs[2]);

        const bladeEls = layerDivs.flatMap((d) => Array.from(d.querySelectorAll('.grass-blade')));
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                bladeEls.forEach((el) => {
                    if (!el.isConnected) return;
                    const s = parseFloat(el.dataset.sizeScale) || 1;
                    const rot = parseFloat(el.dataset.rotation) || 0;
                    el.classList.add('grow');
                    el.style.transform = `translate(-50%, 0) scale(${s}) scaleY(1) rotate(${rot}deg)`;
                });
            });
        });
    }

    /**
     * Shrink grass inward (reverse of grow) before removing flower
     * @param {HTMLElement} flowerWrapper
     * @returns {Promise<void>}
     */
    shrinkGrassAroundFlower(flowerWrapper) {
        const blades = flowerWrapper ? flowerWrapper.querySelectorAll('.grass-blade') : [];
        if (blades.length === 0) return Promise.resolve();

        const SHRINK_DURATION_MS = 700;
        blades.forEach((el) => {
            if (!el.isConnected) return;
            const s = parseFloat(el.dataset.sizeScale) || 1;
            const rot = parseFloat(el.dataset.rotation) || 0;
            el.classList.remove('grow');
            el.style.transition = `transform ${SHRINK_DURATION_MS}ms cubic-bezier(0.4, 0, 0.6, 1)`;
            el.style.transitionDelay = '0ms';
            el.style.transform = `translate(-50%, 0) scale(${s}) scaleY(0) rotate(${rot}deg)`;
        });

        return new Promise((resolve) => setTimeout(resolve, SHRINK_DURATION_MS));
    }

    /**
     * Add YES/NO answer overlay to disc when flower is showing a question
     * @param {HTMLElement} discElement - The disc img element
     * @param {string} answer - 'YES' or 'NO'
     * @param {number} discSize - Disc size in px
     */
    addAnswerToDisc(discElement, answer, discSize = 120) {
        const wrapper = discElement.closest('.flower-disc-wrapper');
        if (!wrapper) return;
        const normalized = String(answer || '').toUpperCase();
        if (normalized !== 'YES' && normalized !== 'NO') return;
        const existing = wrapper.querySelector('.garden-disc-answer');
        // Skip if same answer already displayed - prevents blink when updateVisibleFlowers runs repeatedly
        if (existing && existing.dataset.answer === normalized) return;
        if (existing) existing.remove();
        const asset = (p) => new URL(p, window.location.href).href;
        const src = normalized === 'YES' ? asset('YES.svg') : asset('NO.svg');
        const size = Math.round(discSize * 0.42);
        const overlay = document.createElement('div');
        overlay.className = 'garden-disc-answer';
        overlay.dataset.answer = normalized;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.cssText = `width:${size}px;height:${size}px;opacity:0;transition:opacity 0.15s ease-in`;
        overlay.innerHTML = `<img src="${src}" alt="${normalized}">`;
        wrapper.appendChild(overlay);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
            });
        });
    }

    removeAnswerFromDisc(discElement) {
        const overlay = discElement?.closest('.flower-disc-wrapper')?.querySelector('.garden-disc-answer');
        if (!overlay) return;
        // Already fading out - don't re-trigger
        if (overlay.dataset.fading === 'out') return;
        overlay.dataset.fading = 'out';
        overlay.style.transition = 'opacity 0.15s ease-out';
        overlay.style.opacity = '0';
        setTimeout(() => {
            if (overlay.parentNode) overlay.remove();
        }, 150);
    }

    assignGardenGrassTypes(n) {
        const types = [];
        for (let i = 0; i < n; i++) {
            const prev = types[i - 1];
            const prev2 = types[i - 2];
            const sameAsPrev = prev === 0 || prev === 1;
            const runOfTwo = sameAsPrev && prev2 === prev;
            if (runOfTwo) {
                types.push(1 - prev);
            } else {
                types.push(Math.random() < 0.5 ? 0 : 1);
            }
        }
        return types;
    }

    /**
     * Create or update particles around the newest flower
     */
    updateGardenParticles() {
        const newest = this.flowers.length > 0 ? this.flowers[0] : null;
        const newestId = newest ? String(newest.id) : null;

        if (newestId !== this.newestFlowerId) {
            if (this.particlesAnimationId) {
                cancelAnimationFrame(this.particlesAnimationId);
                this.particlesAnimationId = null;
            }
            if (this.particlesWrapper && this.particlesWrapper.parentNode) {
                this.particlesWrapper.remove();
                this.particlesWrapper = null;
            }
            this.newestFlowerId = newestId;
        }

        if (!newest || !this.canvas) return;

        const isRendered = this.loadedFlowers.has(newestId);
        if (!isRendered) return;

        if (!this.particlesWrapper) {
            this.particlesWrapper = document.createElement('div');
            this.particlesWrapper.className = 'garden-particles-wrapper';
            this.particlesWrapper.style.position = 'absolute';
            this.particlesWrapper.style.left = `${newest.canvasX}px`;
            this.particlesWrapper.style.top = `${newest.canvasY}px`;
            this.particlesWrapper.style.transform = 'translate(-50%, -50%)';
            this.particlesWrapper.style.width = '300px';
            this.particlesWrapper.style.height = '300px';
            this.particlesWrapper.style.pointerEvents = 'none';
            this.particlesWrapper.style.zIndex = String(Math.floor(newest.canvasY) - 1);

            const canvas = document.createElement('canvas');
            canvas.className = 'garden-particles-canvas';
            canvas.width = 300;
            canvas.height = 300;
            canvas.style.width = '300px';
            canvas.style.height = '300px';
            this.particlesWrapper.appendChild(canvas);

            const ctx = canvas.getContext('2d');
            const colors = [[255, 255, 255], [148, 227, 254]];
            const particles = [];
            for (let i = 0; i < 30; i++) {
                const a = Math.random() * Math.PI * 2;
                const r = 50 + Math.random() * 120;
                particles.push({
                    x: 150 + Math.cos(a) * r,
                    y: 150 + Math.sin(a) * r,
                    vx: (Math.random() - 0.5) * 0.8,
                    vy: (Math.random() - 0.5) * 0.8,
                    phase: Math.random() * Math.PI * 2,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    radius: 2 + Math.random() * 2,
                    alpha: 0.4 + Math.random() * 0.4
                });
            }

            let startTime = performance.now();
            const animate = () => {
                const elapsed = (performance.now() - startTime) * 0.001 * 1.1;
                ctx.clearRect(0, 0, 300, 300);
                particles.forEach(p => {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.x += Math.sin(elapsed + p.phase) * 0.5;
                    p.y += Math.cos(elapsed * 0.7 + p.phase) * 0.5;
                    if (p.x < 0 || p.x > 300) p.vx *= -1;
                    if (p.y < 0 || p.y > 300) p.vy *= -1;
                    p.x = Math.max(0, Math.min(300, p.x));
                    p.y = Math.max(0, Math.min(300, p.y));
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${p.alpha * 0.5 + 0.25 * Math.sin(elapsed + p.phase)})`;
                    ctx.fill();
                });
                if (this.particlesWrapper && this.particlesWrapper.parentNode) {
                    this.particlesAnimationId = requestAnimationFrame(animate);
                }
            };
            this.particlesAnimationId = requestAnimationFrame(animate);
            this.canvas.appendChild(this.particlesWrapper);
        } else {
            this.particlesWrapper.style.left = `${newest.canvasX}px`;
            this.particlesWrapper.style.top = `${newest.canvasY}px`;
            this.particlesWrapper.style.zIndex = String(Math.floor(newest.canvasY) - 1);
        }
    }

    /**
     * Remove a flower from the canvas
     */
    removeFlower(flowerId) {
        const flower = this.loadedFlowers.get(flowerId);
        if (!flower || !flower.wrapper) return;

        // Stop animations only - defer cleanup until after fade (cleanup removes disc/petals and would cause instant disappear)
        if (flower.instance && flower.instance.animationFrameId) {
            cancelAnimationFrame(flower.instance.animationFrameId);
            flower.instance.animationFrameId = null;
        }

        // Remove any associated question bubbles
        const bubbleIndex = this.questionBubbles.findIndex(b => b.flowerId === flowerId);
        if (bubbleIndex !== -1) {
            const bubble = this.questionBubbles[bubbleIndex];
            if (bubble.element && bubble.element.parentNode) {
                bubble.element.style.transition = 'opacity 0.3s ease-out';
                bubble.element.style.opacity = '0';
                setTimeout(() => {
                    if (bubble.element && bubble.element.parentNode) {
                        bubble.element.remove();
                    }
                }, 300);
            }
            this.questionBubbles.splice(bubbleIndex, 1);
        }

        // Start flower fade immediately (runs in parallel with grass shrink)
        flower.wrapper.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        flower.wrapper.style.webkitTransition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                flower.wrapper.style.opacity = '0';
                flower.wrapper.style.transform = 'translate(-50%, -50%) scale(0.92)';
            });
        });

        const doRemove = () => {
            if (flower.instance && flower.instance.cleanupExistingElements) {
                flower.instance.cleanupExistingElements();
            }
            flower.instance = null;
            if (flower.wrapper && flower.wrapper.parentNode) {
                const container = flower.wrapper.querySelector('.garden-flower-container');
                if (container) {
                    const discs = container.querySelectorAll('.flower-disc');
                    discs.forEach(disc => {
                        if (disc._gardenDiscTapCleanup) {
                            disc._gardenDiscTapCleanup();
                            delete disc._gardenDiscTapCleanup;
                        }
                    });
                }
                flower.wrapper.remove();
            }
            this.loadedFlowers.delete(flowerId);
        };

        // Shrink grass and fade flower in parallel; remove after both complete (max 0.7s grass, 0.5s fade)
        this.shrinkGrassAroundFlower(flower.wrapper).then(doRemove);
    }

    /**
     * Update which flowers are near the center and show their questions
     */
    updateCenterFlower() {
        const centerX = -this.offsetX + window.innerWidth / 2;
        const centerY = -this.offsetY + window.innerHeight / 2;

        // Find flowers near center (within 500px radius - increased for better sensitivity)
        const nearbyFlowers = [];
        this.loadedFlowers.forEach((flower, id) => {
            // Only consider flowers that have questions
            if (!flower.data || !flower.data.question) return;
            
            const dx = flower.data.canvasX - centerX;
            const dy = flower.data.canvasY - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Increased radius from 400px to 500px for better sensitivity
            if (distance < 500) {
                nearbyFlowers.push({
                    id: id,
                    distance: distance,
                    data: flower.data,
                    wrapper: flower.wrapper
                });
            }
        });

        // Sort by distance and take only the closest one
        nearbyFlowers.sort((a, b) => a.distance - b.distance);
        const newCenterFlowers = nearbyFlowers.slice(0, this.maxBubbles).map(f => f.id);

        // Check if center flowers changed
        const hasChanged = newCenterFlowers.length !== this.centerFlowers.length ||
            newCenterFlowers.some((id, index) => id !== this.centerFlowers[index]);

        if (hasChanged) {
            this.centerFlowers = newCenterFlowers;
            this.updateQuestionBubbles();
        }
    }

    /**
     * Update question bubbles for center flowers
     */
    updateQuestionBubbles() {
        // Remove bubbles for flowers no longer in center (and fade out answer on disc in sync)
        this.questionBubbles = this.questionBubbles.filter(bubble => {
            if (!this.centerFlowers.includes(bubble.flowerId)) {
                const flower = this.loadedFlowers.get(bubble.flowerId);
                if (flower?.wrapper) {
                    const disc = flower.wrapper.querySelector('.flower-disc');
                    if (disc) this.removeAnswerFromDisc(disc);
                }
                bubble.element.style.transition = 'opacity 0.15s ease-out, transform 0.15s ease-out';
                bubble.element.style.opacity = '0';
                bubble.element.style.transform = 'translateY(-10px)';
                setTimeout(() => {
                    if (bubble.element && bubble.element.parentNode) {
                        bubble.element.remove();
                    }
                }, 150);
                return false;
            }
            return true;
        });

        // Add bubbles for new center flowers
        this.centerFlowers.forEach((flowerId, index) => {
            const existingBubble = this.questionBubbles.find(b => b.flowerId === flowerId);
            if (existingBubble) return;

            const flower = this.loadedFlowers.get(flowerId);
            if (!flower) return;

            // For recently created flower: show bubble immediately (wrapper exists from render start)
            const isNewlyCreated = window.lastCreatedFlowerId && String(flowerId) === String(window.lastCreatedFlowerId);
            const canShowBubble = isNewlyCreated 
                ? (flower.wrapper && flower.data?.question)
                : (flower.rendered && flower.instance && flower.wrapper);
            if (!canShowBubble) {
                if (!isNewlyCreated) {
                    console.warn(`🌸 Skipping bubble creation for flower ${flowerId} - flower not fully rendered`);
                }
                return;
            }

            // Verify wrapper is still in DOM
            if (!flower.wrapper.parentNode) {
                console.warn(`🌸 Skipping bubble creation for flower ${flowerId} - wrapper not in DOM`);
                return;
            }

            const bubble = this.createQuestionBubble(flower.data, flower.wrapper, index);
            this.questionBubbles.push(bubble);
            if (flower.data?.answer) {
                const disc = flower.wrapper.querySelector('.flower-disc');
                if (disc) this.addAnswerToDisc(disc, flower.data.answer, flower.data.discSize || 120);
            }
        });
    }

    /**
     * Create question bubble element
     * Large container behind disc and petals (NOT stem), with blurred background
     */
    createQuestionBubble(flowerData, wrapper, index) {
        // Create container div that wraps the bubble
        const bubbleContainer = document.createElement('div');
        bubbleContainer.className = 'garden-question-bubble-container';
        
        // Position container: center-aligned horizontally, bottom edge at 190px
        const wrapperWidth = 400; // Flower wrapper is 400px wide
        const bubbleWidth = 312;
        
        // Center align horizontally: (wrapper width - bubble width) / 2
        const leftPosition = 51; // Updated from calculated value
        
        // Top position updated to -51px
        const topPosition = -120;
        
        bubbleContainer.style.cssText = `
            position: absolute;
            left: ${leftPosition}px;
            top: ${topPosition}px;
            width: ${bubbleWidth}px;
            height: 350px;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            align-items: center;
            opacity: 0;
            transition: opacity 0.15s ease-in;
        `;

        // Create the bubble element
        const bubble = document.createElement('div');
        bubble.className = 'garden-question-bubble';

        const fullQuestion = flowerData.question || '';
        const truncatedDisplay = this.truncateText(fullQuestion, 80);
        const isTruncated = fullQuestion.length > 80;

        bubble.innerHTML = `
            <div class="question-bubble-prefix">I want to know if...</div>
            <div class="question-bubble-text">${truncatedDisplay}</div>
            <div class="question-bubble-flower-space"></div>
        `;

        const textEl = bubble.querySelector('.question-bubble-text');
        if (isTruncated && textEl) {
            textEl.classList.add('is-truncated');
            textEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showQuestionPopup(fullQuestion, flowerData);
            });
        }

        bubbleContainer.appendChild(bubble);

        // Insert container before the flower container so it appears behind
        const flowerContainer = wrapper.querySelector('.garden-flower-container');
        if (flowerContainer) {
            wrapper.insertBefore(bubbleContainer, flowerContainer);
        } else {
            wrapper.appendChild(bubbleContainer);
        }

        // Show bubble immediately - no delay for instant appearance
        bubbleContainer.style.opacity = '1';

        return {
            element: bubbleContainer,
            flowerId: flowerData.id
        };
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    setupQuestionPopup() {
        this.questionPopupEl = document.getElementById('gardenQuestionPopup');
        if (!this.questionPopupEl) return;
        const closeBtn = this.questionPopupEl.querySelector('.garden-question-popup-close');
        const backdrop = this.questionPopupEl.querySelector('.garden-question-popup-backdrop');
        if (closeBtn) closeBtn.addEventListener('click', () => this.hideQuestionPopup());
        if (backdrop) backdrop.addEventListener('click', () => this.hideQuestionPopup());
    }

    setupCommentInput() {
        const inputEl = document.getElementById('gardenCommentInput');
        const submitBtn = document.getElementById('gardenCommentSubmit');
        if (!inputEl || !submitBtn) return;

        const self = this;

        const MAX_LINES = 5;
        const LINE_HEIGHT = 21; // ~15px font * 1.4 line-height
        const MIN_HEIGHT = 44;
        const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES;

        const updateSubmitVisibility = () => {
            requestAnimationFrame(() => {
                const hasText = inputEl.value.trim().length > 0;
                submitBtn.style.display = hasText ? 'flex' : 'none';
            });
        };

        const autoExpandTextarea = () => {
            requestAnimationFrame(() => {
                inputEl.style.height = 'auto';
                const newHeight = Math.min(Math.max(inputEl.scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
                inputEl.style.height = newHeight + 'px';
            });
        };

        inputEl.addEventListener('input', () => {
            updateSubmitVisibility();
            autoExpandTextarea();
        });
        inputEl.addEventListener('keyup', updateSubmitVisibility);
        inputEl.addEventListener('paste', () => {
            setTimeout(() => {
                updateSubmitVisibility();
                autoExpandTextarea();
            }, 0);
        });

        const submitComment = async () => {
            const text = inputEl.value.trim();
            if (!text) return;
            const section = document.getElementById('gardenCommentSection');
            const flowerId = section?.dataset?.flowerId;
            if (!flowerId) {
                console.warn('Cannot submit comment: no flower selected');
                return;
            }

            const auth = typeof window.auth !== 'undefined' ? window.auth : null;
            const profile = auth ? await auth.getProfile() : null;
            if (!profile) {
                if (typeof window.authUI !== 'undefined' && window.authUI.openAuthModal) {
                    window.authUI.openAuthModal('signIn');
                } else {
                    alert('Please sign in to comment');
                }
                return;
            }
            const authorName = profile.displayName || 'Anonymous';
            const authorAvatarSeed = profile.avatarSeed || authorName;

            // Optimistic: add comment to list immediately so user sees it
            const listEl = document.getElementById('gardenCommentList');
            const tempId = 'pending-' + Date.now();
            const emptyState = listEl?.querySelector('.comment-empty-state');
            if (emptyState) emptyState.remove();
            const optimisticComment = {
                id: tempId,
                text,
                authorName,
                authorAvatarSeed,
                likeCount: 0,
                createdAt: new Date().toISOString()
            };
            const optimisticHtml = self.renderCommentItemHtml(optimisticComment);
            if (listEl) listEl.insertAdjacentHTML('beforeend', optimisticHtml);

            inputEl.value = '';
            inputEl.style.height = MIN_HEIGHT + 'px';
            updateSubmitVisibility();

            // Persist to Supabase
            const db = typeof flowerDB !== 'undefined' ? flowerDB : (typeof window !== 'undefined' ? window.flowerDB : null);
            if (!db) {
                console.warn('flowerDB not available - comment not persisted');
                return;
            }
            try {
                const commentId = await db.saveComment({ flowerId, authorName, authorAvatarSeed, text });
                const pendingEl = listEl?.querySelector('[data-comment-id="' + tempId + '"]');
                if (commentId && pendingEl) {
                    pendingEl.dataset.commentId = commentId;
                } else if (!commentId && pendingEl) {
                    pendingEl.remove();
                    if (listEl && !listEl.querySelector('.comment-item')) {
                        listEl.innerHTML = '<div class="comment-empty-state">No comments yet. Be the first to comment!</div>';
                    }
                }
            } catch (err) {
                console.error('Failed to save comment:', err);
                const pendingEl = listEl?.querySelector('[data-comment-id="' + tempId + '"]');
                if (pendingEl) pendingEl.remove();
                if (listEl && !listEl.querySelector('.comment-item')) {
                    listEl.innerHTML = '<div class="comment-empty-state">No comments yet. Be the first to comment!</div>';
                }
            }
        };

        submitBtn.addEventListener('click', submitComment);

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitComment();
            }
        });
    }

    setupCommentListDelegation() {
        const listEl = document.getElementById('gardenCommentList');
        if (!listEl) return;
        listEl.addEventListener('click', async (e) => {
            const likeBtn = e.target.closest('.comment-action[aria-label="Like"]');
            if (!likeBtn) return;
            const item = likeBtn.closest('.comment-item');
            const commentId = item?.dataset?.commentId;
            if (!commentId || String(commentId).startsWith('pending-')) return;
            const db = typeof flowerDB !== 'undefined' ? flowerDB : (typeof window !== 'undefined' ? window.flowerDB : null);
            if (db) {
                const newCount = await db.incrementCommentLike(commentId);
                if (newCount !== null) {
                    let countEl = likeBtn.querySelector('.comment-like-count');
                    if (!countEl) {
                        countEl = document.createElement('span');
                        countEl.className = 'comment-like-count';
                        likeBtn.appendChild(countEl);
                    }
                    countEl.textContent = String(newCount);
                }
            }
        });
    }

    formatCommentTime(createdAt) {
        if (!createdAt) return '';
        const date = new Date(createdAt);
        if (isNaN(date.getTime())) return '';
        const now = Date.now();
        const diffMs = now - date.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHr = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHr / 24);
        const diffWk = Math.floor(diffDay / 7);
        if (diffSec < 60) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHr < 24) return `${diffHr}h ago`;
        if (diffDay < 7) return `${diffDay}d ago`;
        if (diffWk < 4) return `${diffWk}w ago`;
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
    }

    renderCommentItemHtml(c) {
        const authorName = c.authorName || 'Anonymous';
        const initial = String(authorName).trim().charAt(0).toUpperCase() || '?';
        const timeStr = this.formatCommentTime(c.createdAt);
        const likeCount = c.likeCount || 0;
        const likeCountHtml = likeCount > 0 ? ` <span class="comment-like-count">${likeCount}</span>` : '';
        return `<div class="comment-item" data-comment-id="${this.escapeHtml(String(c.id))}">
            <div class="comment-avatar avatar-initial-wrap" role="img" aria-label="${this.escapeHtml(authorName)} avatar"><span class="avatar-initial">${this.escapeHtml(initial)}</span></div>
            <div class="comment-body">
                <div class="comment-meta">
                    <span class="comment-author">${this.escapeHtml(c.authorName)}</span>
                    <span class="comment-time">${this.escapeHtml(timeStr)}</span>
                </div>
                <p class="comment-text">${this.escapeHtml(c.text)}</p>
                <div class="comment-actions">
                    <button type="button" class="comment-action" aria-label="Reply">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        Reply
                    </button>
                    <button type="button" class="comment-action" aria-label="Like">
                        <img src="/Daisy_icon.png" alt="" class="comment-like-icon"> Like${likeCountHtml}
                    </button>
                </div>
            </div>
        </div>`;
    }

    async loadAndRenderComments(flowerId) {
        const listEl = document.getElementById('gardenCommentList');
        if (!listEl) return;
        const db = typeof flowerDB !== 'undefined' ? flowerDB : (typeof window !== 'undefined' ? window.flowerDB : null);
        const comments = db ? await db.getCommentsByFlowerId(flowerId) : [];
        if (comments.length === 0) {
            listEl.innerHTML = '<div class="comment-empty-state">No comments yet. Be the first to comment!</div>';
            return;
        }
        listEl.innerHTML = comments.map(c => this.renderCommentItemHtml(c)).join('');
    }

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async updateCommentInputAuthState() {
        const inputEl = document.getElementById('gardenCommentInput');
        const avatarEl = document.getElementById('gardenCommentInputAvatar') || document.querySelector('.garden-comment-panel .comment-input-avatar');
        if (!inputEl) return;
        const auth = typeof window.auth !== 'undefined' ? window.auth : null;
        const profile = auth ? await auth.getProfile() : null;
        inputEl.placeholder = profile ? 'Add a comment...' : 'Sign in to add a comment...';
        if (avatarEl) {
            if (profile && profile.displayName) {
                const initial = String(profile.displayName).trim().charAt(0).toUpperCase() || '?';
                avatarEl.innerHTML = `<span class="avatar-initial" aria-hidden="true">${this.escapeHtml(initial)}</span>`;
                avatarEl.setAttribute('aria-label', `${profile.displayName} avatar`);
            } else {
                avatarEl.innerHTML = '<span class="avatar-flower" aria-hidden="true"><img src="/Daisy_icon.png" alt="" width="24" height="24"></span>';
                avatarEl.setAttribute('aria-label', 'Anonymous user');
            }
        }
    }

    showQuestionPopup(fullQuestion, flowerData = {}) {
        if (!this.questionPopupEl) return;
        const textEl = this.questionPopupEl.querySelector('.garden-question-popup-text');
        if (textEl) textEl.textContent = fullQuestion ? `"${fullQuestion}"` : '';

        const creatorNameEl = this.questionPopupEl.querySelector('.garden-question-popup-creator-name');
        const creatorDateEl = this.questionPopupEl.querySelector('.garden-question-popup-creator-date');
        const avatarEl = this.questionPopupEl.querySelector('.garden-question-popup-avatar');
        if (creatorNameEl) creatorNameEl.textContent = flowerData.creatorName || 'Anonymous';
        if (creatorDateEl) {
            const dateStr = this.formatCreatedDate(flowerData.timestamp || flowerData.createdAt);
            creatorDateEl.textContent = dateStr || '—';
        }
        if (avatarEl) {
            const seed = flowerData.creatorName || flowerData.id || flowerData.seed || 'Creator';
            avatarEl.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(String(seed))}`;
            avatarEl.alt = flowerData.creatorName || 'Creator avatar';
        }

        this.questionPopupEl.classList.add('is-open');
        this.questionPopupEl.setAttribute('aria-hidden', 'false');
    }

    formatCreatedDate(timestamp) {
        if (!timestamp) return '';
        const date = typeof timestamp === 'number'
            ? new Date(timestamp)
            : new Date(timestamp);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    hideQuestionPopup() {
        if (!this.questionPopupEl) return;
        this.questionPopupEl.classList.remove('is-open');
        this.questionPopupEl.setAttribute('aria-hidden', 'true');
    }

    /**
     * Show empty state
     */
    showEmptyState() {
        console.log('🌸 Showing empty state');
        let emptyState = this.container.querySelector('.garden-empty-state');
        if (!emptyState) {
            emptyState = document.createElement('div');
            emptyState.className = 'garden-empty-state';
            emptyState.innerHTML = `
                <div class="empty-state-content">
                    <div class="empty-state-icon">🌱</div>
                    <h2>No flowers yet</h2>
                    <p>Ask a question and pluck petals to grow your first flower!</p>
                </div>
            `;
            this.container.appendChild(emptyState);
        }
        emptyState.style.display = 'flex';
        console.log('🌸 Empty state displayed');
    }

    hideEmptyState() {
        console.log('🌸 Hiding empty state');
        console.log('🌸 Container:', this.container);
        console.log('🌸 Container exists:', !!this.container);
        
        if (!this.container) {
            console.error('🌸 Cannot hide empty state: container is null');
            return;
        }
        
        const emptyState = this.container.querySelector('.garden-empty-state');
        console.log('🌸 Empty state element found:', !!emptyState);
        
        if (emptyState) {
            emptyState.style.display = 'none';
            console.log('🌸 Empty state hidden successfully');
            // Also try removing it completely
            try {
                emptyState.remove();
                console.log('🌸 Empty state element removed from DOM');
            } catch (removeError) {
                console.warn('🌸 Could not remove empty state element:', removeError);
            }
        } else {
            console.log('🌸 No empty state element found to hide (this is OK if it was never shown)');
        }
        
        // Also check if there are any empty state elements in the entire document
        const allEmptyStates = document.querySelectorAll('.garden-empty-state');
        if (allEmptyStates.length > 0) {
            console.log(`🌸 Found ${allEmptyStates.length} empty state element(s) in document, hiding all`);
            allEmptyStates.forEach(el => {
                el.style.display = 'none';
                try {
                    el.remove();
                } catch (e) {
                    console.warn('🌸 Could not remove empty state:', e);
                }
            });
        }
    }

    /**
     * Setup navigation buttons
     */
    setupNavigation() {
        const gardenButton = document.getElementById('gardenButton');
        const homeGardenButton = document.getElementById('homeGardenButton');
        const backButton = document.getElementById('backButton');
        const gardenPage = document.getElementById('gardenPage');
        const flowerPage = document.getElementById('flowerPage');
        const questionPage = document.getElementById('questionPage');

        const goToGarden = async () => {
            if (flowerPage) flowerPage.classList.remove('active');
            if (questionPage) questionPage.classList.remove('active');
            if (gardenPage) gardenPage.classList.add('active');

            requestAnimationFrame(async () => {
                if (!this.canvas && this.container) {
                    this.canvas = document.createElement('div');
                    this.canvas.className = 'garden-canvas';
                    this.canvas.style.width = `${this.canvasSize}px`;
                    this.canvas.style.height = `${this.canvasSize}px`;
                    this.canvas.style.position = 'absolute';
                    this.canvas.style.top = '0';
                    this.canvas.style.left = '0';
                    this.container.appendChild(this.canvas);
                }

                await this.refreshGarden();
            });
        };

        if (gardenButton) {
            gardenButton.addEventListener('click', goToGarden);
        }
        if (homeGardenButton) {
            homeGardenButton.addEventListener('click', goToGarden);
        }

        if (backButton) {
            backButton.addEventListener('click', () => {
                this.hideGardenCommentSection();
                gardenPage.classList.remove('active');
                flowerPage.classList.remove('active');
                const questionPage = document.getElementById('questionPage');
                if (questionPage) questionPage.classList.add('active');
                if (typeof window.goToHomepageWithReset === 'function') {
                    window.goToHomepageWithReset();
                }
            });
        }
    }

    /**
     * Refresh garden - reload all flowers
     */
    async refreshGarden() {
        console.log('🌸 Refreshing garden...');
        console.log('🌸 Current flowers count before refresh:', this.flowers.length);
        const targetFlowerId = window.lastCreatedFlowerId;
        console.log('🌸 Target flower ID:', targetFlowerId);

        // Clear existing flowers
        this.flowers = [];
        this.loadedFlowers.forEach((flower) => {
            if (flower.wrapper && flower.wrapper.parentNode) {
                flower.wrapper.remove();
            }
        });
        this.loadedFlowers.clear();
        this.centerFlowers = [];
        this.lastRenderedArea = null;
        
        // Clear question bubbles
        this.questionBubbles.forEach(bubble => {
            if (bubble.element && bubble.element.parentNode) {
                bubble.element.remove();
            }
        });
        this.questionBubbles = [];
        
        // Clear canvas and particles
        if (this.particlesAnimationId) {
            cancelAnimationFrame(this.particlesAnimationId);
            this.particlesAnimationId = null;
        }
        this.particlesWrapper = null;
        this.newestFlowerId = null;
        this.loadedGhostFlowers.clear();
        if (this.canvas) {
            this.canvas.innerHTML = '';
        }
        
        console.log('🌸 Cleared all flowers, ghosts, and bubbles');

        // Reset loading flag so loadAllFlowers doesn't skip (e.g. from stale previous load)
        this.isLoading = false;

        // Load fresh data from Supabase
        console.log('🌸 Calling loadAllFlowers()...');
        await this.loadAllFlowers();
        console.log('🌸 loadAllFlowers() completed. Flowers count:', this.flowers.length);

        // CRITICAL: Ensure empty state is hidden if we have flowers
        if (this.flowers.length > 0) {
            console.log('🌸 We have flowers, hiding empty state');
            this.hideEmptyState();
            
            // Ensure flowers and ghosts are rendered immediately after refresh
            const doUpdate = () => {
                if (this.updateVisibleFlowersThrottle) clearTimeout(this.updateVisibleFlowersThrottle);
                this.updateVisibleFlowers();
                console.log(`🌸 After refresh: ${this.loadedFlowers.size} flowers, ${this.loadedGhostFlowers.size} ghosts`);
            };
            setTimeout(doUpdate, 100);
            setTimeout(doUpdate, 400);
        } else {
            console.error('🌸 CRITICAL: No flowers after loadAllFlowers in refreshGarden!');
            this.showEmptyState();
        }

        console.log('🌸 Garden refresh complete');
        console.log(`🌸 Looking for flower ID: ${targetFlowerId}`);
        console.log(`🌸 Available flower IDs:`, this.flowers.map(f => f.id).slice(0, 10));

        // If target flower not found (Supabase eventual consistency), retry load once
        const targetFound = targetFlowerId && this.flowers.some(f => String(f.id) === String(targetFlowerId));
        if (targetFlowerId && this.flowers.length > 0 && !targetFound) {
            console.log('🌸 New flower not yet in results, retrying load after 500ms...');
            await new Promise(resolve => setTimeout(resolve, 500));
            this.isLoading = false;
            await this.loadAllFlowers();
        }

        // If we have a target flower, try to center on it
        if (targetFlowerId && this.flowers.length > 0) {
            setTimeout(() => {
                this.scrollToFlower(targetFlowerId);
            }, 500);
        } else if (this.flowers.length > 0) {
            // Center on newest flower
            const newest = this.flowers[0];
            if (newest && newest.canvasX && newest.canvasY) {
                console.log('🌸 Centering on newest flower:', newest.id);
                this.centerOn(newest.canvasX, newest.canvasY);
                // Ensure flowers are rendered immediately
                setTimeout(() => {
                    if (this.updateVisibleFlowersThrottle) {
                        clearTimeout(this.updateVisibleFlowersThrottle);
                    }
                    this.updateVisibleFlowers();
                }, 50);
            } else {
                console.warn('🌸 Newest flower missing position, using canvas center');
                this.centerOn(this.canvasSize / 2, this.canvasSize / 2);
                // Ensure flowers are rendered immediately
                setTimeout(() => {
                    if (this.updateVisibleFlowersThrottle) {
                        clearTimeout(this.updateVisibleFlowersThrottle);
                    }
                    this.updateVisibleFlowers();
                }, 50);
            }
        }
    }

    /**
     * Scroll to a specific flower and show it with its question in the center
     */
    scrollToFlower(flowerId) {
        if (!flowerId) {
            console.warn('🌸 scrollToFlower called with no flowerId');
            return;
        }
        
        console.log(`🌸 Searching for flower ID: ${flowerId} (type: ${typeof flowerId})`);
        console.log(`🌸 Total flowers in array: ${this.flowers.length}`);
        
        const flower = this.findFlowerById(flowerId);
        
        if (flower) {
            console.log(`📍 Found flower! Centering on flower ${flowerId} at (${flower.canvasX}, ${flower.canvasY})`);
            this.centerOn(flower.canvasX, flower.canvasY);
            
            // Ensure target flower shows question when it's the newly created one
            const isNewlyCreated = String(flowerId) === String(window.lastCreatedFlowerId);
            if (isNewlyCreated && flower && !flower.showsQuestion && flower.question) {
                flower.showsQuestion = true;
            }
            
            // Force show question bubble immediately when landing on garden with newly created flower
            // centerFlowers controls which flower shows its question; force target to center
            const showLandingBubble = () => {
                const idStr = String(flowerId);
                const flowerRef = this.loadedFlowers.get(idStr) || this.loadedFlowers.get(flowerId);
                if (flowerRef && flowerRef.wrapper && flowerRef.data?.question) {
                    const existingBubble = this.questionBubbles.find(b => String(b.flowerId) === idStr);
                    if (!existingBubble) {
                        this.centerFlowers = [idStr];
                        this.updateQuestionBubbles();
                    }
                }
            };
            // Run repeatedly until question shows (flower may need frames to render)
            showLandingBubble();
            requestAnimationFrame(() => requestAnimationFrame(showLandingBubble));
            [50, 150, 300].forEach(ms => setTimeout(showLandingBubble, ms));
        } else {
            console.warn(`⏳ Flower ${flowerId} not found in ${this.flowers.length} flowers`);
            console.log('🌸 Available flower IDs:', this.flowers.map(f => `${f.id} (${typeof f.id})`).slice(0, 10));
            // Don't refresh again to avoid infinite loop - just center on newest
            if (this.flowers.length > 0) {
                const newest = this.flowers[0];
                console.log('🌸 Centering on newest flower instead:', newest.id);
                this.centerOn(newest.canvasX, newest.canvasY);
            }
        }
    }
}

// Initialize garden page when DOM is ready
let gardenPageInstance;

// Function to initialize garden page (can be called multiple times safely)
function initializeGardenPage() {
    // Don't reinitialize if already exists
    if (window.gardenPageInstance) {
        console.log('🌸 Garden page instance already exists');
        return window.gardenPageInstance;
    }
    
    // Check if GardenPage class is available
    if (typeof GardenPage === 'undefined') {
        console.error('🌸 GardenPage class is not defined. Scripts may not be loaded in correct order.');
        console.error('🌸 Available globals:', Object.keys(window).filter(k => k.includes('Garden') || k.includes('garden')));
        return null;
    }
    
    const gardenPage = document.getElementById('gardenPage');
    if (!gardenPage) {
        console.error('🌸 Garden page element (id="gardenPage") not found in DOM');
        console.error('🌸 Available page elements:', Array.from(document.querySelectorAll('.page')).map(el => el.id));
        return null;
    }
    
    const gardenContainer = document.getElementById('gardenContainer');
    if (!gardenContainer) {
        console.error('🌸 Garden container element (id="gardenContainer") not found in DOM');
        return null;
    }
    
    try {
        console.log('🌸 Creating GardenPage instance...');
        gardenPageInstance = new GardenPage();
        
        if (!gardenPageInstance) {
            console.error('🌸 GardenPage constructor returned null/undefined');
            return null;
        }
        
        window.gardenPageInstance = gardenPageInstance;
        console.log('🌸 Garden page instance created and assigned to window.gardenPageInstance');
        console.log('🌸 Instance properties:', {
            container: !!gardenPageInstance.container,
            canvas: !!gardenPageInstance.canvas,
            initialized: gardenPageInstance.initialized
        });
        
        // Wait for initialization to complete
        // Check every 100ms for up to 5 seconds
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        
        const checkInitialized = setInterval(() => {
            attempts++;
            if (gardenPageInstance && gardenPageInstance.initialized) {
                clearInterval(checkInitialized);
                console.log('🌸 Garden page instance ready and initialized');
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInitialized);
                console.warn('🌸 Garden page instance initialization timeout, but instance exists');
                console.warn('🌸 Instance state:', {
                    exists: !!gardenPageInstance,
                    initialized: gardenPageInstance ? gardenPageInstance.initialized : false,
                    container: gardenPageInstance ? !!gardenPageInstance.container : false,
                    canvas: gardenPageInstance ? !!gardenPageInstance.canvas : false
                });
                // Still mark as available even if initialization timed out
                // The instance exists and can be used, just might not be fully ready
            }
        }, 100);
        
        return gardenPageInstance;
    } catch (error) {
        console.error('🌸 Error creating garden page instance:', error);
        console.error('🌸 Error name:', error.name);
        console.error('🌸 Error message:', error.message);
        console.error('🌸 Error stack:', error.stack);
        // Don't set window.gardenPageInstance if creation failed
        window.gardenPageInstance = null;
        return null;
    }
}

// Initialize on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeGardenPage();
    });
} else {
    // DOM is already loaded, initialize immediately
    initializeGardenPage();
}

// Also expose initialization function globally for manual calls
window.initializeGardenPage = initializeGardenPage;

// Expose GardenPage class globally for fallback creation
if (typeof window !== 'undefined') {
    window.GardenPage = GardenPage;
}

/**
 * Setup disc tap functionality for garden flowers
 * Behaves like original flower component but without petal detachment
 */
GardenPage.prototype.setupGardenDiscTap = function(discElement, flowerInstance, flowerId) {
    if (!discElement || !flowerInstance) return;
    
    // Override detachRandomPetals to prevent petal detachment in garden
    const originalDetachRandomPetals = flowerInstance.detachRandomPetals;
    flowerInstance.detachRandomPetals = function(count) {
        // Do nothing - prevent petal detachment in garden view
        // The tap animation will still play, but petals won't be detached
    };
    
    // Store original method for potential restoration
    discElement._originalDetachMethod = originalDetachRandomPetals;
    
    // The FlowerComponent already has its own event listeners set up
    // We just need to override the detachRandomPetals method
    // The tap animation will work normally, but petals won't detach
    
    // Store cleanup function on the disc element for later restoration
    discElement._gardenDiscTapCleanup = () => {
        // Restore original detachRandomPetals method
        if (discElement._originalDetachMethod && flowerInstance) {
            flowerInstance.detachRandomPetals = discElement._originalDetachMethod;
            delete discElement._originalDetachMethod;
        }
    };
};
