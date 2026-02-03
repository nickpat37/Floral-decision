/**
 * Garden Page Handler
 * Displays all flowers ever created in an infinite scroll layout
 * - Lazy loads flowers as user scrolls
 * - Shows max 3 question bubbles for flowers in center of screen
 * - Animates flowers moving away when questions are displayed
 * - Growing animation for newly loaded flowers
 */

class GardenPage {
    constructor() {
        this.container = null;
        this.flowers = [];
        this.loadedFlowers = new Map(); // Track loaded flower instances
        this.visibleFlowers = new Set(); // Track currently visible flowers
        this.centerFlowers = []; // Max 3 flowers showing questions
        this.loadBatchSize = 20; // Load 20 flowers at a time
        this.flowerSpacing = 400; // Vertical spacing between flowers
        this.viewportPadding = 200; // Extra padding for lazy loading
        this.isLoading = false;
        this.allFlowersLoaded = false;
        this.scrollTop = 0;
        
        // Question bubble management
        this.questionBubbles = [];
        this.maxQuestionBubbles = 3;
        
        this.init();
    }
    
    async init() {
        this.container = document.getElementById('gardenContainer');
        if (!this.container) return;
        
        // Wait for database to be ready
        if (typeof flowerDB !== 'undefined') {
            await flowerDB.init();
        }
        
        // Setup scroll listener
        this.setupScrollListener();
        
        // Setup navigation
        this.setupNavigation();
        
        // Load initial batch
        await this.loadFlowers(0, this.loadBatchSize);
        
        // Start intersection observer for question bubbles
        this.setupIntersectionObserver();
        
        // Check if we need to scroll to a newly created flower
        if (window.lastCreatedFlowerId) {
            setTimeout(() => {
                this.scrollToFlower(window.lastCreatedFlowerId);
                // Clear the flag after scrolling
                window.lastCreatedFlowerId = null;
            }, 500);
        }
    }
    
    /**
     * Setup scroll listener for lazy loading
     */
    setupScrollListener() {
        let scrollTimeout;
        this.container.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                this.handleScroll();
            }, 100);
        });
        
        // Initial check
        this.handleScroll();
    }
    
    /**
     * Handle scroll event - lazy load flowers
     */
    async handleScroll() {
        if (this.isLoading || this.allFlowersLoaded) return;
        
        const containerHeight = this.container.clientHeight;
        const scrollTop = this.container.scrollTop;
        const scrollBottom = scrollTop + containerHeight;
        const contentHeight = this.container.scrollHeight;
        
        // Load more if near bottom
        if (scrollBottom + this.viewportPadding >= contentHeight) {
            const offset = this.flowers.length;
            await this.loadFlowers(offset, this.loadBatchSize);
        }
        
        // Update visible flowers and question bubbles
        this.updateVisibleFlowers();
    }
    
    /**
     * Load flowers from database
     */
    async loadFlowers(offset, limit) {
        if (this.isLoading) return;
        this.isLoading = true;
        
        try {
            if (typeof flowerDB === 'undefined') {
                console.warn('Database not available');
                this.isLoading = false;
                return;
            }
            
            const newFlowers = await flowerDB.getAllFlowers({ offset, limit });
            
            if (newFlowers.length === 0) {
                this.allFlowersLoaded = true;
                this.isLoading = false;
                return;
            }
            
            // Add flowers to array
            this.flowers.push(...newFlowers);
            
            // Render new flowers
            this.renderFlowers(newFlowers, offset);
            
            // Check if we got fewer than requested (end of data)
            if (newFlowers.length < limit) {
                this.allFlowersLoaded = true;
            }
        } catch (error) {
            console.error('Error loading flowers:', error);
        }
        
        this.isLoading = false;
    }
    
    /**
     * Render flowers in the garden
     */
    renderFlowers(flowerDataArray, startIndex) {
        flowerDataArray.forEach((flowerData, index) => {
            const globalIndex = startIndex + index;
            const yPosition = globalIndex * this.flowerSpacing + this.flowerSpacing;
            
            // Create flower wrapper
            const flowerWrapper = document.createElement('div');
            flowerWrapper.className = 'garden-flower-wrapper';
            flowerWrapper.dataset.flowerId = flowerData.id;
            flowerWrapper.dataset.flowerIndex = globalIndex;
            flowerWrapper.id = `flower-wrapper-${flowerData.id}`;
            flowerWrapper.style.position = 'absolute';
            flowerWrapper.style.left = '50%';
            flowerWrapper.style.top = `${yPosition}px`;
            flowerWrapper.style.transform = 'translateX(-50%)';
            flowerWrapper.style.width = '100vw';
            flowerWrapper.style.height = `${this.flowerSpacing}px`;
            flowerWrapper.style.opacity = '0'; // Start invisible for grow animation
            
            // Create flower container
            const flowerContainer = document.createElement('div');
            flowerContainer.className = 'garden-flower-container';
            flowerContainer.id = `gardenFlower_${flowerData.id}`;
            
            // Create SVG for stem
            const stemSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            stemSVG.className = 'stem-svg';
            stemSVG.id = `gardenStemSVG_${flowerData.id}`;
            stemSVG.style.position = 'absolute';
            stemSVG.style.top = '0';
            stemSVG.style.left = '0';
            stemSVG.style.width = '100%';
            stemSVG.style.height = '100%';
            stemSVG.style.pointerEvents = 'none';
            
            const stemPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            stemPath.className = 'stem-path';
            stemPath.id = `gardenStemPath_${flowerData.id}`;
            stemSVG.appendChild(stemPath);
            flowerContainer.appendChild(stemSVG);
            
            // Create flower component with saved seed
            const flowerInstance = new FlowerComponent({
                containerId: `gardenFlower_${flowerData.id}`,
                stemSVGId: `gardenStemSVG_${flowerData.id}`,
                stemPathId: `gardenStemPath_${flowerData.id}`,
                seed: flowerData.seed,
                numPetals: flowerData.numPetals,
                petalRadius: flowerData.petalRadius,
                discSize: flowerData.discSize
            });
            
            // Store flower instance
            this.loadedFlowers.set(flowerData.id, {
                instance: flowerInstance,
                data: flowerData,
                wrapper: flowerWrapper,
                yPosition: yPosition
            });
            
            flowerWrapper.appendChild(flowerContainer);
            this.container.appendChild(flowerWrapper);
            
            // Animate flower growing in (like Airbnb lazy loading)
            setTimeout(() => {
                flowerWrapper.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
                flowerWrapper.style.opacity = '1';
                flowerWrapper.style.transform = 'translateX(-50%) scale(1)';
            }, 50 + (index * 50)); // Stagger animations
        });
        
        // Update container height
        const totalHeight = this.flowers.length * this.flowerSpacing + this.flowerSpacing;
        this.container.style.height = `${totalHeight}px`;
    }
    
    /**
     * Setup Intersection Observer to detect flowers in center
     */
    setupIntersectionObserver() {
        const observerOptions = {
            root: this.container,
            rootMargin: '-30% 0px -30% 0px', // Only center 40% of viewport
            threshold: [0, 0.1, 0.5, 1]
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const flowerId = entry.target.dataset.flowerId;
                
                if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
                    this.visibleFlowers.add(flowerId);
                } else {
                    this.visibleFlowers.delete(flowerId);
                }
            });
            
            // Update question bubbles
            this.updateQuestionBubbles();
        }, observerOptions);
        
        // Observe all flower wrappers
        const wrappers = this.container.querySelectorAll('.garden-flower-wrapper');
        wrappers.forEach(wrapper => observer.observe(wrapper));
        
        // Re-observe when new flowers are added
        const mutationObserver = new MutationObserver(() => {
            const newWrappers = this.container.querySelectorAll('.garden-flower-wrapper:not([data-observed])');
            newWrappers.forEach(wrapper => {
                wrapper.dataset.observed = 'true';
                observer.observe(wrapper);
            });
        });
        
        mutationObserver.observe(this.container, { childList: true });
    }
    
    /**
     * Update visible flowers based on scroll position
     */
    updateVisibleFlowers() {
        const containerRect = this.container.getBoundingClientRect();
        const viewportTop = -containerRect.top;
        const viewportBottom = viewportTop + window.innerHeight;
        const centerY = viewportTop + (window.innerHeight / 2);
        
        // Find flowers in center area
        const centerFlowerIds = [];
        const centerArea = window.innerHeight * 0.4; // 40% center area
        
        this.loadedFlowers.forEach((flower, id) => {
            const flowerY = flower.yPosition;
            const distanceFromCenter = Math.abs(flowerY - centerY);
            
            if (distanceFromCenter < centerArea / 2) {
                centerFlowerIds.push({
                    id: id,
                    distance: distanceFromCenter,
                    y: flowerY
                });
            }
        });
        
        // Sort by distance from center and take top 3
        centerFlowerIds.sort((a, b) => a.distance - b.distance);
        this.centerFlowers = centerFlowerIds.slice(0, this.maxQuestionBubbles).map(f => f.id);
        
        // Update question bubbles
        this.updateQuestionBubbles();
    }
    
    /**
     * Update question bubbles for flowers in center
     */
    updateQuestionBubbles() {
        // Remove bubbles for flowers no longer in center
        this.questionBubbles = this.questionBubbles.filter(bubble => {
            if (!this.centerFlowers.includes(bubble.flowerId)) {
                // Animate out
                bubble.element.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
                bubble.element.style.opacity = '0';
                bubble.element.style.transform = 'translateY(-10px)';
                
                setTimeout(() => {
                    bubble.element.remove();
                }, 300);
                
                return false;
            }
            return true;
        });
        
        // Add bubbles for new center flowers
        this.centerFlowers.forEach((flowerId, index) => {
            // Check if bubble already exists
            const existingBubble = this.questionBubbles.find(b => b.flowerId === flowerId);
            if (existingBubble) return;
            
            const flower = this.loadedFlowers.get(flowerId);
            if (!flower) return;
            
            // Create question bubble
            const bubble = this.createQuestionBubble(flower.data, flower.wrapper, index);
            this.questionBubbles.push(bubble);
        });
        
        // Move other flowers away when questions are showing
        this.animateFlowersAway();
    }
    
    /**
     * Create question bubble element
     */
    createQuestionBubble(flowerData, wrapper, index) {
        const bubble = document.createElement('div');
        bubble.className = 'garden-question-bubble';
        bubble.style.position = 'absolute';
        bubble.style.left = '50%';
        bubble.style.top = '50%';
        bubble.style.transform = `translate(-50%, -50%) translateY(${(index - 1) * 120}px)`;
        bubble.style.opacity = '0';
        bubble.style.transition = 'opacity 0.4s ease-in, transform 0.4s ease-out';
        
        bubble.innerHTML = `
            <div class="question-bubble-prefix">I want to know if...</div>
            <div class="question-bubble-text">${this.truncateText(flowerData.question, 80)}</div>
        `;
        
        wrapper.appendChild(bubble);
        
        // Animate in
        setTimeout(() => {
            bubble.style.opacity = '1';
            bubble.style.transform = `translate(-50%, -50%) translateY(${(index - 1) * 120}px)`;
        }, 100);
        
        return {
            element: bubble,
            flowerId: flowerData.id
        };
    }
    
    /**
     * Truncate text with ellipsis
     */
    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
    
    /**
     * Animate flowers away from center when questions are showing
     */
    animateFlowersAway() {
        const hasQuestions = this.centerFlowers.length > 0;
        
        this.loadedFlowers.forEach((flower, id) => {
            const isCenter = this.centerFlowers.includes(id);
            const wrapper = flower.wrapper;
            
            if (hasQuestions && !isCenter) {
                // Move away
                const distance = Math.random() * 100 + 50; // Random 50-150px
                const direction = Math.random() < 0.5 ? -1 : 1;
                
                wrapper.style.transition = 'transform 0.5s ease-out';
                wrapper.style.transform = `translateX(calc(-50% + ${distance * direction}px)) scale(0.9)`;
            } else {
                // Return to center
                wrapper.style.transition = 'transform 0.5s ease-out';
                wrapper.style.transform = 'translateX(-50%) scale(1)';
            }
        });
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
                
                // Refresh visible flowers when entering garden
                setTimeout(() => {
                    this.updateVisibleFlowers();
                }, 100);
                
                // If there's a newly created flower, scroll to it
                if (window.lastCreatedFlowerId) {
                    setTimeout(() => {
                        this.scrollToFlower(window.lastCreatedFlowerId);
                        window.lastCreatedFlowerId = null; // Clear after scrolling
                    }, 300);
                }
            });
        }
        
        if (backButton) {
            backButton.addEventListener('click', () => {
                gardenPage.classList.remove('active');
                flowerPage.classList.add('active');
            });
        }
    }
}

    /**
     * Scroll to a specific flower by ID
     */
    async scrollToFlower(flowerId) {
        // Find the flower wrapper by ID or data attribute
        let wrapper = document.getElementById(`flower-wrapper-${flowerId}`);
        if (!wrapper) {
            wrapper = this.container.querySelector(`[data-flower-id="${flowerId}"]`);
        }
        
        if (wrapper) {
            // Get the Y position from the top style
            const topValue = wrapper.style.top;
            const yValue = parseInt(topValue) || 0;
            
            // Calculate scroll position to center the flower
            const scrollPosition = Math.max(0, yValue - (window.innerHeight / 2) + (this.flowerSpacing / 2));
            
            // Scroll to the flower
            this.container.scrollTo({
                top: scrollPosition,
                behavior: 'smooth'
            });
            
            // Highlight the flower briefly with a pulse animation
            wrapper.style.transition = 'transform 0.5s ease-out, opacity 0.3s ease-out';
            wrapper.style.transform = 'translateX(-50%) scale(1.1)';
            wrapper.style.opacity = '1';
            
            setTimeout(() => {
                wrapper.style.transform = 'translateX(-50%) scale(1)';
            }, 1500);
            
            // Update visible flowers after scroll
            setTimeout(() => {
                this.updateVisibleFlowers();
            }, 800);
            
            console.log(`📍 Scrolled to flower ${flowerId}`);
        } else {
            // Flower not loaded yet, refresh and try again
            console.log(`⏳ Flower ${flowerId} not loaded yet, refreshing...`);
            await this.refreshAndScrollToFlower(flowerId);
        }
    }
    
    /**
     * Refresh garden page and scroll to flower
     */
    async refreshAndScrollToFlower(flowerId) {
        console.log(`🔄 Refreshing garden to find flower ${flowerId}`);
        
        // Clear current flowers
        this.flowers = [];
        this.loadedFlowers.clear();
        this.container.innerHTML = '';
        this.allFlowersLoaded = false;
        
        // Reload flowers (load more to ensure we get the new one)
        await this.loadFlowers(0, Math.max(this.loadBatchSize, 50));
        
        // Wait for flower to render, then scroll
        // Try multiple times in case it's still loading
        let attempts = 0;
        const maxAttempts = 5;
        const checkAndScroll = async () => {
            attempts++;
            const wrapper = document.getElementById(`flower-wrapper-${flowerId}`) || 
                           this.container.querySelector(`[data-flower-id="${flowerId}"]`);
            
            if (wrapper) {
                await this.scrollToFlower(flowerId);
            } else if (attempts < maxAttempts) {
                // Wait a bit more and try again
                setTimeout(checkAndScroll, 300);
            } else {
                console.warn(`⚠️ Could not find flower ${flowerId} after ${maxAttempts} attempts`);
            }
        };
        
        setTimeout(checkAndScroll, 500);
    }
}

// Initialize garden page when DOM is ready
let gardenPageInstance;
document.addEventListener('DOMContentLoaded', () => {
    const gardenPage = document.getElementById('gardenPage');
    if (gardenPage) {
        gardenPageInstance = new GardenPage();
        window.gardenPageInstance = gardenPageInstance; // Make globally accessible
    }
});
