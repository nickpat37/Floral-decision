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
        this.centerFlowers = []; // Array of flowers near center (max 1)
        this.questionBubbles = []; // Array of active question bubbles
        this.maxBubbles = 1; // Maximum number of bubbles to show (only closest to center)

        // Canvas settings
        this.canvasSize = 10000; // Virtual canvas size (10000x10000)
        this.flowerSpread = 400; // Spread between flowers
        this.isolatedSpread = 400; // Spread for flowers showing questions (denser)
        this.denseSpread = 150; // Spread for flowers not showing questions (much denser)
        this.viewportPadding = 500; // Load flowers this far outside viewport

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
        this.maxFlowersToShow = 20; // Limit total flowers shown

        this.init();
    }

    async init() {
        this.container = document.getElementById('gardenContainer');
        if (!this.container) return;

        // Hide empty state initially (will be shown if no flowers)
        this.hideEmptyState();

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
                
                const emergencyFlowersWithPositions = emergencyFlowers.map((flower, index) => {
                    let pos;
                    try {
                        pos = this.getFlowerPosition(index, flower.seed, flower.showsQuestion);
                    } catch (posError) {
                        console.error('🌸 Error getting emergency position:', posError);
                        pos = {
                            x: this.canvasSize / 2 + (index * 200),
                            y: this.canvasSize / 2 + (index * 200)
                        };
                    }
                    return {
                        ...flower,
                        canvasX: pos.x,
                        canvasY: pos.y
                    };
                });
                this.flowers = emergencyFlowersWithPositions;
                console.log(`🌸 Emergency: Generated ${this.flowers.length} flowers`);
                if (this.flowers.length > 0) {
                    this.hideEmptyState();
                    const newest = this.flowers[0];
                    if (newest && newest.canvasX && newest.canvasY) {
                        this.centerOn(newest.canvasX, newest.canvasY);
                    } else {
                        this.centerOn(this.canvasSize / 2, this.canvasSize / 2);
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
        } else {
            console.error('🌸 CRITICAL: Initialization completed with ZERO flowers!');
        }
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

        // Update visible flowers (but don't lazy load yet - wait for drag end)
        // Only if we have flowers loaded
        if (this.flowers.length > 0) {
            this.updateVisibleFlowers();
        }
    }

    /**
     * Check if we've moved to a new area and need to lazy load flowers
     */
    checkAndLazyLoad() {
        if (this.flowers.length === 0) return;
        
        const currentArea = {
            x: Math.floor(-this.offsetX / (this.viewportPadding * 2)),
            y: Math.floor(-this.offsetY / (this.viewportPadding * 2))
        };

        if (!this.lastRenderedArea || 
            currentArea.x !== this.lastRenderedArea.x || 
            currentArea.y !== this.lastRenderedArea.y) {
            console.log('🌸 New area detected, lazy loading flowers...');
            this.lastRenderedArea = currentArea;
            this.updateVisibleFlowers();
        }
    }

    /**
     * Center the view on a specific position
     */
    centerOn(x, y) {
        if (!this.canvas) return;

        this.offsetX = -x + window.innerWidth / 2;
        this.offsetY = -y + window.innerHeight / 2;

        // Clamp
        const maxOffset = this.canvasSize - window.innerWidth;
        const maxOffsetY = this.canvasSize - window.innerHeight;
        this.offsetX = Math.max(-maxOffset, Math.min(0, this.offsetX));
        this.offsetY = Math.max(-maxOffsetY, Math.min(0, this.offsetY));

        this.canvas.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px)`;
        
        // Only update visible flowers if we have flowers loaded
        if (this.flowers.length > 0) {
            this.updateVisibleFlowers();
        }
    }

    /**
     * Generate a deterministic position for a flower
     * Flowers with questions get isolated spacing, others get dense spacing
     */
    getFlowerPosition(index, seed, hasQuestion = false) {
        const random = this.seededRandom(seed + index);
        const random2 = this.seededRandom(seed + index + 1000);

        // Use different spread based on whether flower shows question
        const spread = hasQuestion ? this.isolatedSpread : this.denseSpread;
        
        // Arrange flowers in a spiral-like pattern from center
        const angle = index * 137.5 * (Math.PI / 180); // Golden angle
        const radius = Math.sqrt(index) * spread;

        // Add some randomness (less for isolated flowers)
        const jitterAmount = hasQuestion ? 100 : 150;
        const jitterX = (random - 0.5) * jitterAmount;
        const jitterY = (random2 - 0.5) * jitterAmount;

        const centerX = this.canvasSize / 2;
        const centerY = this.canvasSize / 2;

        return {
            x: centerX + Math.cos(angle) * radius + jitterX,
            y: centerY + Math.sin(angle) * radius + jitterY
        };
    }

    /**
     * Seeded random number generator
     */
    seededRandom(seed) {
        const x = Math.sin(seed * 9999) * 10000;
        return x - Math.floor(x);
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

        for (let i = 0; i < count; i++) {
            try {
                const seed = Math.random();
                const hasQuestion = i < 3; // First 3 flowers show questions (isolated)
                
                // Ensure getFlowerPosition doesn't fail
                let pos;
                try {
                    pos = this.getFlowerPosition(i, seed, hasQuestion);
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
            const dbFlowersWithPositions = dbFlowers.map((flower, index) => {
                // First few database flowers show questions (isolated)
                const showsQuestion = index < 3;
                const pos = this.getFlowerPosition(index, flower.seed || index, showsQuestion);
                
                // Create a new object instead of mutating the readonly one
                return {
                    ...flower,
                    canvasX: pos.x,
                    canvasY: pos.y,
                    showsQuestion: showsQuestion
                };
            });

            // Mock flowers after database flowers (dense)
            const mockFlowersWithPositions = mockFlowers.map((flower, index) => {
                const dbIndex = dbFlowers.length + index;
                const pos = this.getFlowerPosition(dbIndex, flower.seed, false);
                
                return {
                    ...flower,
                    canvasX: pos.x,
                    canvasY: pos.y
                };
            });

            // Combine flowers: database first, then mock
            // IMPORTANT: Always include all mock flowers, don't slice them away
            const allFlowers = [...dbFlowersWithPositions, ...mockFlowersWithPositions];
            this.flowers = allFlowers.slice(0, Math.max(this.maxFlowersToShow, 10)); // Ensure at least 10

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
                } catch (centerError) {
                    console.error('🌸 Error in centerOn:', centerError);
                }
                
                // Force immediate render of visible flowers (don't wait for lazy loading)
                setTimeout(() => {
                    console.log('🌸 Force updating visible flowers after centering...');
                    try {
                        this.updateVisibleFlowers();
                        console.log('🌸 updateVisibleFlowers completed');
                    } catch (updateError) {
                        console.error('🌸 Error in updateVisibleFlowers:', updateError);
                        console.error('🌸 Error stack:', updateError.stack);
                    }
                }, 100);
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
                
                const mockFlowersWithPositions = mockFlowers.map((flower, index) => {
                    const pos = this.getFlowerPosition(index, flower.seed, flower.showsQuestion || false);
                    return {
                        ...flower,
                        canvasX: pos.x,
                        canvasY: pos.y
                    };
                });
                
                this.flowers = mockFlowersWithPositions;
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

        const viewportLeft = -this.offsetX - this.viewportPadding;
        const viewportTop = -this.offsetY - this.viewportPadding;
        const viewportRight = viewportLeft + window.innerWidth + this.viewportPadding * 2;
        const viewportBottom = viewportTop + window.innerHeight + this.viewportPadding * 2;

        console.log(`🌸 Viewport: L=${viewportLeft.toFixed(0)}, T=${viewportTop.toFixed(0)}, R=${viewportRight.toFixed(0)}, B=${viewportBottom.toFixed(0)}`);
        console.log(`🌸 Offset: X=${this.offsetX.toFixed(0)}, Y=${this.offsetY.toFixed(0)}`);

        // Track which flowers should be visible
        const visibleIds = new Set();
        let visibleCount = 0;

        this.flowers.forEach((flower) => {
            if (!flower.canvasX || !flower.canvasY) {
                console.warn(`🌸 Flower ${flower.id} missing position data`);
                return;
            }

            const isVisible = (
                flower.canvasX >= viewportLeft &&
                flower.canvasX <= viewportRight &&
                flower.canvasY >= viewportTop &&
                flower.canvasY <= viewportBottom
            );

            if (isVisible) {
                visibleIds.add(flower.id);
                visibleCount++;

                // Render if not already rendered (lazy loading)
                if (!this.loadedFlowers.has(flower.id)) {
                    console.log(`🌸 Rendering flower ${flower.id} at (${flower.canvasX.toFixed(0)}, ${flower.canvasY.toFixed(0)})`);
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
                }
            }
        });

        console.log(`🌸 ${visibleCount} flowers visible, ${this.loadedFlowers.size} currently rendered`);

        // Remove flowers no longer visible
        this.loadedFlowers.forEach((data, id) => {
            if (!visibleIds.has(id)) {
                this.removeFlower(id);
            }
        });

        // Update center flower for question bubble
        this.updateCenterFlower();
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
        const numPetals = flowerData.numPetals || 20;
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
        // Set z-index based on y position: higher y = lower on screen = higher z-index = in front
        // Use canvasY directly as z-index (higher values = in front)
        flowerWrapper.style.zIndex = Math.floor(canvasY);

        // Create flower container
        const flowerContainer = document.createElement('div');
        flowerContainer.className = 'garden-flower-container';
        flowerContainer.id = `gardenFlower_${flowerId}`;
        flowerContainer.style.width = '400px';
        flowerContainer.style.height = '400px';

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

        // Store reference placeholder with plain copy
        const flowerRef = {
            instance: null,
            data: flowerDataCopy,
            wrapper: flowerWrapper
        };
        this.loadedFlowers.set(flowerId, flowerRef);

        // Wait for DOM to be ready before creating flower component
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const originalTransform = flowerWrapper.style.transform;
                flowerWrapper.style.transform = 'translate(-50%, -50%) scale(1)';
                
                // Create flower component using extracted values
                const flowerInstance = new FlowerComponent({
                    containerId: `gardenFlower_${flowerId}`,
                    stemSVGId: `gardenStemSVG_${flowerId}`,
                    stemPathId: `gardenStemPath_${flowerId}`,
                    seed: seed,
                    numPetals: numPetals,
                    petalRadius: petalRadius,
                    discSize: discSize
                });

                flowerWrapper.style.transform = originalTransform;
                flowerRef.instance = flowerInstance;

                // Animate growing in
                requestAnimationFrame(() => {
                    flowerWrapper.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
                    flowerWrapper.style.transform = 'translate(-50%, -50%) scale(1)';
                });
            });
        });
    }

    /**
     * Remove a flower from the canvas
     */
    removeFlower(flowerId) {
        const flower = this.loadedFlowers.get(flowerId);
        if (flower && flower.wrapper) {
            flower.wrapper.style.transition = 'transform 0.3s ease-in, opacity 0.3s ease-in';
            flower.wrapper.style.transform = 'translate(-50%, -50%) scale(0)';
            flower.wrapper.style.opacity = '0';

            setTimeout(() => {
                if (flower.wrapper && flower.wrapper.parentNode) {
                    flower.wrapper.remove();
                }
            }, 300);

            this.loadedFlowers.delete(flowerId);
        }
    }

    /**
     * Update which flowers are near the center and show their questions
     */
    updateCenterFlower() {
        const centerX = -this.offsetX + window.innerWidth / 2;
        const centerY = -this.offsetY + window.innerHeight / 2;

        // Find flowers near center (within 400px radius)
        const nearbyFlowers = [];
        this.loadedFlowers.forEach((flower, id) => {
            const dx = flower.data.canvasX - centerX;
            const dy = flower.data.canvasY - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 400) {
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
        // Remove bubbles for flowers no longer in center
        this.questionBubbles = this.questionBubbles.filter(bubble => {
            if (!this.centerFlowers.includes(bubble.flowerId)) {
                bubble.element.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
                bubble.element.style.opacity = '0';
                bubble.element.style.transform = 'translateY(-10px)';
                
                setTimeout(() => {
                    if (bubble.element && bubble.element.parentNode) {
                        bubble.element.remove();
                    }
                }, 300);
                
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

            const bubble = this.createQuestionBubble(flower.data, flower.wrapper, index);
            this.questionBubbles.push(bubble);
        });
    }

    /**
     * Create question bubble element
     * Large container behind disc and petals (NOT stem), with blurred background
     */
    createQuestionBubble(flowerData, wrapper, index) {
        const bubble = document.createElement('div');
        bubble.className = 'garden-question-bubble';
        
        // Position bubble: center-aligned horizontally, bottom edge at 190px
        const wrapperWidth = 400; // Flower wrapper is 400px wide
        const bubbleWidth = 312;
        const bubbleHeight = 380;
        
        // Center align horizontally: (wrapper width - bubble width) / 2
        const leftPosition = 51; // Updated from calculated value
        
        // Top position updated to -51px
        const topPosition = -120;
        
        bubble.style.cssText = `
            position: absolute;
            left: ${leftPosition}px;
            top: ${topPosition}px;
            width: ${bubbleWidth}px;
            height: ${bubbleHeight}px;
            transform: none;
            opacity: 0;
            transition: opacity 0.4s ease-in;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: flex-start;
            text-align: left;
        `;

        // Format: Two-line format - "I want to know if..." (prefix) + question
        bubble.innerHTML = `
            <div class="question-bubble-prefix">I want to know if...</div>
            <div class="question-bubble-text">${this.truncateText(flowerData.question || '', 80)}</div>
        `;

        // Insert bubble before the flower container so it appears behind
        const flowerContainer = wrapper.querySelector('.garden-flower-container');
        if (flowerContainer) {
            wrapper.insertBefore(bubble, flowerContainer);
        } else {
            wrapper.appendChild(bubble);
        }

        requestAnimationFrame(() => {
            bubble.style.opacity = '1';
        });

        return {
            element: bubble,
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
                flowerPage.classList.add('active');
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
        
        // Clear canvas
        if (this.canvas) {
            this.canvas.innerHTML = '';
        }
        
        console.log('🌸 Cleared all flowers and bubbles');

        // Load fresh data
        console.log('🌸 Calling loadAllFlowers()...');
        await this.loadAllFlowers();
        console.log('🌸 loadAllFlowers() completed. Flowers count:', this.flowers.length);

        // CRITICAL: Ensure empty state is hidden if we have flowers
        if (this.flowers.length > 0) {
            console.log('🌸 We have flowers, hiding empty state');
            this.hideEmptyState();
        } else {
            console.error('🌸 CRITICAL: No flowers after loadAllFlowers in refreshGarden!');
            this.showEmptyState();
        }

        console.log('🌸 Garden refresh complete');
        console.log(`🌸 Looking for flower ID: ${targetFlowerId}`);
        console.log(`🌸 Available flower IDs:`, this.flowers.map(f => f.id).slice(0, 10));

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
            } else {
                console.warn('🌸 Newest flower missing position, using canvas center');
                this.centerOn(this.canvasSize / 2, this.canvasSize / 2);
            }
        }
    }

    /**
     * Scroll to a specific flower
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
            }, 500);
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
document.addEventListener('DOMContentLoaded', () => {
    const gardenPage = document.getElementById('gardenPage');
    if (gardenPage) {
        gardenPageInstance = new GardenPage();
        window.gardenPageInstance = gardenPageInstance;
    }
});
