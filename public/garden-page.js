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

        // Verify flowers were loaded
        if (this.flowers.length === 0) {
            console.error('🌸 CRITICAL: No flowers loaded after loadAllFlowers()!');
            console.error('🌸 Attempting emergency mock flower generation...');
            try {
                const emergencyFlowers = this.generateMockFlowers(10);
                if (emergencyFlowers.length === 0) {
                    throw new Error('generateMockFlowers returned empty array');
                }
                
                const emergencyFlowersWithPositions = [];
                emergencyFlowers.forEach((flower, index) => {
                    let pos;
                    try {
                        pos = this.getFlowerPosition(index, flower.seed, flower.showsQuestion, emergencyFlowersWithPositions);
                    } catch (posError) {
                        console.error('🌸 Error getting emergency position:', posError);
                        pos = {
                            x: this.canvasSize / 2 + (index * 200),
                            y: this.canvasSize / 2 + (index * 200)
                        };
                    }
                    const positionedFlower = {
                        ...flower,
                        canvasX: pos.x,
                        canvasY: pos.y
                    };
                    emergencyFlowersWithPositions.push(positionedFlower);
                });
                this.flowers = emergencyFlowersWithPositions;
                this.generateGhostFlowers();
                console.log(`🌸 Emergency: Generated ${this.flowers.length} flowers`);
                if (this.flowers.length > 0) {
                    this.hideEmptyState();
                    const newest = this.flowers[0];
                    if (newest && newest.canvasX && newest.canvasY) {
                        this.centerOn(newest.canvasX, newest.canvasY);
                        // Ensure flowers are rendered immediately
                        setTimeout(() => {
                            if (this.updateVisibleFlowersThrottle) {
                                clearTimeout(this.updateVisibleFlowersThrottle);
                            }
                            this.updateVisibleFlowers();
                        }, 50);
                    } else {
                        this.centerOn(this.canvasSize / 2, this.canvasSize / 2);
                        // Ensure flowers are rendered immediately
                        setTimeout(() => {
                            if (this.updateVisibleFlowersThrottle) {
                                clearTimeout(this.updateVisibleFlowersThrottle);
                            }
                            this.updateVisibleFlowers();
                        }, 50);
                    }
                } else {
                    this.showEmptyState();
                }
            } catch (emergencyError) {
                console.error('🌸 Emergency generation also failed:', emergencyError);
                console.error('🌸 Emergency error stack:', emergencyError.stack);
                this.showEmptyState();
            }
        } else {
            // Ensure empty state is hidden if we have flowers
            this.hideEmptyState();
            
            // CRITICAL: Center and render flowers after successful load
            if (this.flowers.length > 0) {
                const newest = this.flowers[0];
                if (newest && newest.canvasX && newest.canvasY) {
                    console.log(`🌸 Centering on newest flower at (${newest.canvasX}, ${newest.canvasY})`);
                    this.centerOn(newest.canvasX, newest.canvasY);
                    // Ensure flowers are rendered immediately
                    setTimeout(() => {
                        if (this.updateVisibleFlowersThrottle) {
                            clearTimeout(this.updateVisibleFlowersThrottle);
                        }
                        this.updateVisibleFlowers();
                        console.log(`🌸 Initial render complete: ${this.loadedFlowers.size} flowers rendered`);
                    }, 100);
                } else {
                    console.warn('🌸 Newest flower missing position, centering on canvas middle');
                    this.centerOn(this.canvasSize / 2, this.canvasSize / 2);
                    // Ensure flowers are rendered immediately
                    setTimeout(() => {
                        if (this.updateVisibleFlowersThrottle) {
                            clearTimeout(this.updateVisibleFlowersThrottle);
                        }
                        this.updateVisibleFlowers();
                        console.log(`🌸 Initial render complete: ${this.loadedFlowers.size} flowers rendered`);
                    }, 100);
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
        document.addEventListener('mouseup', () => this.onDragEnd());

        // Touch drag
        this.container.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.container.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.container.addEventListener('touchend', () => this.onDragEnd());

        // Mouse wheel for zoom/pan
        this.container.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    }

    onDragStart(e) {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.container.style.cursor = 'grabbing';
    }

    onDragMove(e) {
        if (!this.isDragging) return;

        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;

        this.pan(deltaX, deltaY);

        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }

    onDragEnd() {
        this.isDragging = false;
        this.container.style.cursor = 'grab';
        // Check if we've moved to a new area and need to lazy load
        this.checkAndLazyLoad();
    }

    onTouchStart(e) {
        if (e.touches.length === 1) {
            this.isDragging = true;
            this.lastTouchX = e.touches[0].clientX;
            this.lastTouchY = e.touches[0].clientY;
        }
    }

    onTouchMove(e) {
        if (!this.isDragging || e.touches.length !== 1) return;
        e.preventDefault();

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
     * Uses same spiral pattern as real flowers + larger jitter for natural randomness.
     * Does not modify this.flowers.
     */
    generateGhostFlowers() {
        this.ghostFlowers = [];
        if (this.flowers.length === 0) return;
        const centerX = this.canvasSize / 2;
        const centerY = this.canvasSize / 2;
        const ghostSpread = 170; // tighter spiral to fill gaps between real flowers
        const ghostJitter = 90;
        const ghostSeed = 0.42;
        let id = 0;
        const maxCandidates = this.maxGhostFlowers * 6; // more attempts to fill dense gaps
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
            this.ghostFlowers.push({
                id: `ghost-${id++}`,
                canvasX: x,
                canvasY: y
            });
        }
        console.log(`🌸 Generated ${this.ghostFlowers.length} ghost flowers`);
    }

    /**
     * Generate mock flowers for testing (limited number)
     */
    generateMockFlowers(count = 10) {
        if (count <= 0) {
            console.warn('🌸 generateMockFlowers called with count <= 0, using default 10');
            count = 10;
        }
        
        const mockFlowers = [];
        const mockQuestions = [
            'I got any luck on TOTO today',
            'i shud continue my distance relationship',
            'Will I get the job I applied for?',
            'Should I move to a new city?',
            'Is today a good day to make decisions?',
            'Will it rain tomorrow?',
            'Should I take the risk?',
            'Am I making the right choice?',
            'Will this work out for me?',
            'Should I trust my instincts?'
        ];

        const mockAnswers = ['Yes', 'No', 'Maybe', 'Definitely', 'Probably not'];

        // Track positioned flowers to prevent overlaps within this batch
        const positionedMockFlowers = [];
        
        for (let i = 0; i < count; i++) {
            try {
                const seed = Math.random();
                const hasQuestion = i < 3; // First 3 flowers show questions (isolated)
                
                // Ensure getFlowerPosition doesn't fail
                let pos;
                try {
                    // Pass existing positioned mock flowers to prevent overlaps
                    pos = this.getFlowerPosition(i, seed, hasQuestion, positionedMockFlowers);
                } catch (posError) {
                    console.error(`🌸 Error getting position for flower ${i}:`, posError);
                    // Fallback position
                    pos = {
                        x: this.canvasSize / 2 + (i * 100),
                        y: this.canvasSize / 2 + (i * 100)
                    };
                }
                
                const flower = {
                    id: `mock-${i}`,
                    question: mockQuestions[i % mockQuestions.length],
                    answer: mockAnswers[i % mockAnswers.length],
                    numPetals: Math.floor(Math.random() * (30 - 12 + 1)) + 12,
                    petalRadius: 88,
                    discSize: 120,
                    seed: seed,
                    timestamp: Date.now() - (i * 1000000),
                    canvasX: pos.x,
                    canvasY: pos.y,
                    showsQuestion: hasQuestion
                };
                
                // Validate flower has required properties
                if (!flower.canvasX || !flower.canvasY) {
                    console.error(`🌸 Flower ${i} missing position:`, flower);
                    flower.canvasX = this.canvasSize / 2 + (i * 100);
                    flower.canvasY = this.canvasSize / 2 + (i * 100);
                }
                
                mockFlowers.push(flower);
            } catch (error) {
                console.error(`🌸 Error generating mock flower ${i}:`, error);
                console.error(`🌸 Error stack:`, error.stack);
                // Create a minimal flower even if generation fails
                mockFlowers.push({
                    id: `mock-${i}-emergency`,
                    question: 'Emergency flower',
                    answer: 'Yes',
                    numPetals: 20,
                    petalRadius: 88,
                    discSize: 120,
                    seed: Math.random(),
                    timestamp: Date.now(),
                    canvasX: this.canvasSize / 2 + (i * 200),
                    canvasY: this.canvasSize / 2 + (i * 200),
                    showsQuestion: false
                });
            }
        }

        console.log(`🌸 Generated ${mockFlowers.length} mock flowers (requested ${count})`);
        if (mockFlowers.length === 0) {
            console.error('🌸 CRITICAL: generateMockFlowers returned ZERO flowers!');
        }
        return mockFlowers;
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

            // ALWAYS generate at least 10 mock flowers to ensure something is displayed
            // This is critical - we should never have zero flowers
            const mockCount = Math.max(10, dbFlowers.length > 0 
                ? Math.min(Math.max(0, this.maxFlowersToShow - dbFlowers.length), 10)
                : 10);
            
            console.log('🌸 Generating mock flowers, count:', mockCount);
            const mockFlowers = this.generateMockFlowers(mockCount);
            console.log('🌸 Generated mock flowers:', mockFlowers.length);
            if (mockFlowers.length === 0) {
                console.error('🌸 CRITICAL: generateMockFlowers returned empty array!');
            } else {
                console.log('🌸 Mock flowers sample:', mockFlowers.slice(0, 2));
            }

            // Create copies of database flowers with positions (don't mutate readonly objects)
            // Track existing flowers to prevent overlaps
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

            // Mock flowers after database flowers (dense)
            const mockFlowersWithPositions = [];
            mockFlowers.forEach((flower, index) => {
                const dbIndex = dbFlowers.length + index;
                const pos = this.getFlowerPosition(dbIndex, flower.seed, false, positionedFlowers);
                
                const positionedFlower = {
                    ...flower,
                    canvasX: pos.x,
                    canvasY: pos.y
                };
                
                positionedFlowers.push(positionedFlower);
                mockFlowersWithPositions.push(positionedFlower);
            });

            // Combine flowers: database first, then mock
            // IMPORTANT: Always include all mock flowers, don't slice them away
            const allFlowers = [...dbFlowersWithPositions, ...mockFlowersWithPositions];
            
            // Final verification: ensure no overlaps exist
            this.ensureNoOverlaps(allFlowers);
            
            this.flowers = allFlowers.slice(0, Math.max(this.maxFlowersToShow, 10)); // Ensure at least 10

            this.generateGhostFlowers();

            console.log(`🌸 Total flowers in array: ${this.flowers.length}`);
            console.log(`🌸 Database flowers: ${dbFlowers.length}, Mock flowers: ${mockFlowers.length}`);
            console.log(`🌸 dbFlowersWithPositions: ${dbFlowersWithPositions.length}, mockFlowersWithPositions: ${mockFlowersWithPositions.length}`);
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
                console.log('🌸 Entering flowers.length === 0 block');
                console.error('🌸 CRITICAL ERROR: Flowers array is empty after combining!');
                console.error('🌸 dbFlowersWithPositions:', dbFlowersWithPositions);
                console.error('🌸 mockFlowersWithPositions:', mockFlowersWithPositions);
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
            // Fallback to mock flowers only - MUST succeed
            try {
                console.log('🌸 Attempting fallback mock flower generation...');
                const mockFlowers = this.generateMockFlowers(10);
                if (mockFlowers.length === 0) {
                    throw new Error('generateMockFlowers returned empty array');
                }
                
                const mockFlowersWithPositions = [];
                mockFlowers.forEach((flower, index) => {
                    // Use existing positioned flowers to prevent overlaps
                    const pos = this.getFlowerPosition(index, flower.seed, flower.showsQuestion || false, mockFlowersWithPositions);
                    const positionedFlower = {
                        ...flower,
                        canvasX: pos.x,
                        canvasY: pos.y
                    };
                    mockFlowersWithPositions.push(positionedFlower);
                });
                
                this.flowers = mockFlowersWithPositions;
                this.generateGhostFlowers();
                console.log(`🌸 Fallback: Generated ${this.flowers.length} mock flowers`);
                
                if (this.flowers.length === 0) {
                    console.error('🌸 CRITICAL: Even fallback mock flowers failed!');
                    this.showEmptyState();
                } else {
                    console.log('🌸 Fallback successful, hiding empty state');
                    this.hideEmptyState();
                    const newest = this.flowers[0];
                    if (newest && newest.canvasX && newest.canvasY) {
                        this.centerOn(newest.canvasX, newest.canvasY);
                    } else {
                        console.warn('🌸 Newest flower missing position, centering on canvas middle');
                        this.centerOn(this.canvasSize / 2, this.canvasSize / 2);
                    }
                }
            } catch (fallbackError) {
                console.error('🌸 CRITICAL: Fallback also failed:', fallbackError);
                console.error('🌸 Fallback error stack:', fallbackError.stack);
                // Last resort: create a single flower manually
                try {
                    const emergencyFlower = {
                        id: 'emergency-1',
                        question: 'Emergency flower',
                        answer: 'Yes',
                        numPetals: 20,
                        petalRadius: 88,
                        discSize: 120,
                        seed: Math.random(),
                        timestamp: Date.now(),
                        canvasX: this.canvasSize / 2,
                        canvasY: this.canvasSize / 2,
                        showsQuestion: false
                    };
                    this.flowers = [emergencyFlower];
                    this.generateGhostFlowers();
                    this.hideEmptyState();
                    this.centerOn(emergencyFlower.canvasX, emergencyFlower.canvasY);
                    console.log('🌸 Emergency flower created');
                } catch (emergencyError) {
                    console.error('🌸 Even emergency flower failed:', emergencyError);
                    this.flowers = [];
                    this.showEmptyState();
                }
            }
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

        // Ghost flowers: render when in viewport, remove when out
        const visibleGhostIds = new Set();
        if (this.ghostFlowers.length > 0) {
            for (const ghost of this.ghostFlowers) {
                const inView = ghost.canvasX >= viewportLeft && ghost.canvasX <= viewportRight &&
                    ghost.canvasY >= viewportTop && ghost.canvasY <= viewportBottom;
                if (inView) {
                    visibleGhostIds.add(ghost.id);
                    if (!this.loadedGhostFlowers.has(ghost.id)) {
                        this.renderGhostFlower(ghost);
                    } else {
                        const ref = this.loadedGhostFlowers.get(ghost.id);
                        if (ref && ref.wrapper && ref.wrapper.parentNode) {
                            ref.wrapper.style.visibility = 'visible';
                            ref.wrapper.style.opacity = '1';
                        }
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
                    discSize: discSize
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
        img.src = 'GHOST_FLOWER.png';
        img.alt = '';
        img.className = 'ghost-flower-image';
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

        // Format: Two-line format - "I want to know if..." (prefix) + question + flower space
        bubble.innerHTML = `
            <div class="question-bubble-prefix">I want to know if...</div>
            <div class="question-bubble-text">${this.truncateText(flowerData.question || '', 80)}</div>
            <div class="question-bubble-flower-space"></div>
        `;

        // Add bubble to container
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
        const backButton = document.getElementById('backButton');
        const gardenPage = document.getElementById('gardenPage');
        const flowerPage = document.getElementById('flowerPage');

        if (gardenButton) {
            gardenButton.addEventListener('click', async () => {
                flowerPage.classList.remove('active');
                gardenPage.classList.add('active');

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
            });
        }

        if (backButton) {
            backButton.addEventListener('click', () => {
                gardenPage.classList.remove('active');
                if (typeof window.goToHomepageWithReset === 'function') {
                    window.goToHomepageWithReset();
                } else {
                    document.getElementById('flowerPage').classList.add('active');
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
        if (this.canvas) {
            this.canvas.innerHTML = '';
        }
        
        console.log('🌸 Cleared all flowers and bubbles');

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
            
            // Ensure flowers are rendered immediately after refresh
            setTimeout(() => {
                if (this.updateVisibleFlowersThrottle) {
                    clearTimeout(this.updateVisibleFlowersThrottle);
                }
                this.updateVisibleFlowers();
                console.log(`🌸 After refresh: ${this.loadedFlowers.size} flowers rendered`);
            }, 100);
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
            // Run immediately + rAF + 50ms (flower may need a frame to land in loadedFlowers)
            showLandingBubble();
            requestAnimationFrame(() => requestAnimationFrame(showLandingBubble));
            setTimeout(showLandingBubble, 100);
            
            // Highlight the flower briefly
            setTimeout(() => {
                const flowerRef = this.loadedFlowers.get(flower.id);
                if (flowerRef && flowerRef.wrapper) {
                    flowerRef.wrapper.style.transition = 'transform 0.5s ease-out';
                    flowerRef.wrapper.style.transform = 'translate(-50%, -50%) scale(1.2)';
                    setTimeout(() => {
                        flowerRef.wrapper.style.transform = 'translate(-50%, -50%) scale(1)';
                    }, 1500);
                }
            }, 50);
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
