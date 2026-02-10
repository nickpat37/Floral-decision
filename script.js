/**
 * Flower Component
 * 
 * The Flower Component handles the entire interactive flower and all its interactions:
 * - Disc: Draggable center of the flower, can be tapped to detach petals
 * - Stem: Flexible stem that connects disc to bottom, maintains fixed length, bends at 1/3 point
 * - Petals: Can be stretched, shrunk, swung, and detached
 * 
 * Interactions:
 * - Tap on disc: Detaches 1-3 petals (based on force), increases disc size, swings petals
 * - Drag disc: Moves disc, stem follows with fixed length
 * - Stretch petal: Pull petal to stretch (up to 25%) or shrink (down to 90%)
 * - Swipe near disc: Disc follows swipe direction, detaches petals
 */
class FlowerComponent {
    constructor(options = {}) {
        // Allow custom container IDs, default to flower page IDs
        const containerId = options.containerId || 'flowerContainer';
        const stemSVGId = options.stemSVGId || 'stemSVG';
        const stemPathId = options.stemPathId || 'stemPath';
        
        this.container = document.getElementById(containerId);
        this.stemSVG = document.getElementById(stemSVGId);
        this.stemPath = document.getElementById(stemPathId);
        
        // Check if container exists
        if (!this.container) {
            console.error(`🌸 FlowerComponent ERROR: Container with ID '${containerId}' not found`);
            console.error(`🌸 Available containers:`, Array.from(document.querySelectorAll('[id^="gardenFlower_"]')).map(el => el.id));
            return;
        }
        
        if (!this.stemSVG) {
            console.error(`🌸 FlowerComponent ERROR: Stem SVG with ID '${stemSVGId}' not found`);
            return;
        }
        
        if (!this.stemPath) {
            console.error(`🌸 FlowerComponent ERROR: Stem path with ID '${stemPathId}' not found`);
            return;
        }
        
        // Get container dimensions for positioning
        const containerRect = this.container.getBoundingClientRect();
        // Use explicit style dimensions if getBoundingClientRect returns zero (e.g., parent is scaled to 0)
        const styleWidth = parseInt(this.container.style.width) || parseInt(window.getComputedStyle(this.container).width) || 400;
        const styleHeight = parseInt(this.container.style.height) || parseInt(window.getComputedStyle(this.container).height) || 400;
        this.containerWidth = containerRect.width > 0 ? containerRect.width : styleWidth;
        this.containerHeight = containerRect.height > 0 ? containerRect.height : styleHeight;
        
        // Initial positions - adjust based on container
        this.originalDiscX = this.containerWidth / 2;
        this.originalDiscY = this.containerHeight * 0.4;
        this.discX = this.originalDiscX;
        this.discY = this.originalDiscY;
        this.stemBottomX = this.containerWidth / 2;
        this.stemBottomY = this.containerHeight;
        
        // Disc properties
        this.discSize = options.discSize || 120;
        this.originalDiscSize = options.discSize || 120; // Store original disc size for tap animation
        this.discElement = null;
        this.isDraggingDisc = false;
        this.dragOffset = { x: 0, y: 0 };
        this.tapStartTime = 0;
        this.tapStartPosition = { x: 0, y: 0 };
        this.isTap = false;
        
        // Swipe detection properties
        this.swipeStartPosition = { x: 0, y: 0 };
        this.swipeStartTime = 0;
        this.isSwiping = false;
        this.swipeThreshold = 30; // Minimum distance for a swipe
        this.swipeAreaRadius = null; // Will be calculated (disc radius * 1.5)
        this.swipeCurrentPosition = { x: 0, y: 0 }; // Current swipe position for real-time following
        
        // Spring physics for disc bounce-back
        this.discSpringVelocity = { x: 0, y: 0 };
        this.discSpringActive = false;
        this.springStrength = 0.05; // Reduced to 5% for less sensitive bouncing
        this.springDamping = 0.98; // Higher damping for minimal bounce
        this.discPullStrength = 0.3; // How much disc moves when petal is pulled
        
        // Fixed stem length
        this.fixedStemLength = null; // Will be calculated on init
        
        // Stem stiffness (0-1, lower = stiffer/less flexible)
        this.stemStiffness = 0.05; // 5% flexibility (95% stiffness)
        
        // Maximum disc movement from original position (due to stem hardness)
        this.maxDiscMovement = null; // Will be calculated on init
        
        // Petal properties
        // Random number of petals between 12 and 30 (inclusive), or use saved value
        // CRITICAL: Clamp to valid range: 12-30 with strict validation
        const requestedPetals = options.numPetals || Math.floor(Math.random() * (30 - 12 + 1)) + 12;
        
        // Ensure we have a valid number
        if (typeof requestedPetals !== 'number' || isNaN(requestedPetals)) {
            console.error(`🌸 CRITICAL: Invalid numPetals value: ${requestedPetals}, using default 20`);
            this.numPetals = 20;
        } else {
            // Strict clamping: ensure integer between 12 and 30
            const clamped = Math.max(12, Math.min(30, Math.floor(Math.abs(requestedPetals))));
            this.numPetals = clamped;
            if (requestedPetals !== this.numPetals) {
                console.warn(`🌸 Petal count clamped from ${requestedPetals} to ${this.numPetals} (valid range: 12-30)`);
            }
        }
        
        // Final verification
        if (this.numPetals < 12 || this.numPetals > 30) {
            console.error(`🌸 CRITICAL ERROR: numPetals is ${this.numPetals}, forcing to 20`);
            this.numPetals = 20;
        }
        this.petalRadius = options.petalRadius || 88; // Distance from disc center to petal center
        this.petals = [];
        this.detachedPetals = []; // Petals that have fallen off
        this.finalAnswer = null; // Will be set when last petal is detached
        this.answerDisplayed = false; // Track if answer has been shown
        this.savedFlowerId = null; // Track if flower has been saved to prevent duplicates
        this.seed = options.seed || Math.random(); // Seed for consistent petal arrangement
        this.stretchingPetal = null;
        this.stretchStartDistance = 0;
        this.stretchStartLength = 0;
        this.maxStretchFactor = 1.25; // 25% max stretch before detachment
        
        // Physics properties
        this.gravity = 0.4; // 20% lighter (reduced from 0.5)
        this.animationFrameId = null;
        
        // Tap animation properties
        this.tapAnimationActive = false;
        this.tapAnimationStartTime = 0;
        this.tapAnimationDuration = 400; // Animation duration in ms
        
        // Continuous petal detachment during swiping/dragging
        this.swipeDetachInterval = null; // Interval ID for swipe detachment
        this.swipeDetachIntervalMs = 300; // Detach petals every 300ms during swiping
        this.lastSwipeDetachTime = 0; // Last time a petal was detached during swipe
        
        // Continuous petal detachment during disc dragging
        this.dragDetachInterval = null; // Interval ID for drag detachment
        this.dragDetachIntervalMs = 250; // Detach petals every 250ms during forceful dragging
        this.lastDragDetachTime = 0; // Last time a petal was detached during drag
        this.lastDragPosition = { x: 0, y: 0 }; // Last drag position for velocity calculation
        this.dragVelocityThreshold = 5; // Minimum velocity (pixels per frame) to trigger detachment
        
        this.init();
    }
    
    init() {
        // CRITICAL: Clean up any existing flower elements before creating new ones
        // This prevents multiple discs/petals when FlowerComponent is initialized multiple times
        this.cleanupExistingElements();
        
        // Calculate fixed stem length based on original positions
        const dx = this.originalDiscX - this.stemBottomX;
        const dy = this.originalDiscY - this.stemBottomY;
        this.fixedStemLength = Math.sqrt(dx * dx + dy * dy);
        
        // Maximum disc movement from original position (due to stem hardness)
        this.maxDiscMovement = this.fixedStemLength * 0.15; // 15% of stem length max movement
        
        // Calculate swipe area radius (disc radius + 50% = 1.5 * disc radius)
        this.swipeAreaRadius = (this.discSize / 2) * 1.5;
        
        this.createStem();
        this.createDisc();
        this.createPetals();
        this.setupEventListeners();
        this.updateStem();
        
        // Ensure disc size is set correctly after a short delay (in case image loads late)
        setTimeout(() => {
            if (this.discElement) {
                this.discSize = this.originalDiscSize;
                this.discElement.style.width = `${this.discSize}px`;
                this.discElement.style.height = `${this.discSize}px`;
                this.discElement.style.left = `${this.discX - this.discSize / 2}px`;
                this.discElement.style.top = `${this.discY - this.discSize / 2}px`;
            }
            
            // Ensure all petals maintain fixed size
            this.petals.forEach(petal => {
                if (petal.attached && petal.element) {
                    petal.element.style.height = '80px';
                    petal.element.style.width = 'auto';
                }
            });
            
            // Recalculate swipe area radius after disc size is confirmed
            this.swipeAreaRadius = (this.discSize / 2) * 1.5;
        }, 100);
        
        this.startPhysicsLoop();
    }
    
    /**
     * Clean up any existing flower elements (disc, petals) from the container
     * This prevents duplicate elements when FlowerComponent is reinitialized
     */
    cleanupExistingElements() {
        if (!this.container) return;
        
        // Only clean up if there are actually existing elements
        // This prevents issues on initial page load when container is empty
        const existingDiscs = this.container.querySelectorAll('.flower-disc');
        const existingPetals = this.container.querySelectorAll('.flower-petal');
        const detachedPetals = this.container.querySelectorAll('.detached-petal');
        
        if (existingDiscs.length > 0 || existingPetals.length > 0 || detachedPetals.length > 0) {
            console.log(`🌸 Cleaning up ${existingDiscs.length} discs, ${existingPetals.length} petals, ${detachedPetals.length} detached petals`);
            
            // Remove all existing discs
            existingDiscs.forEach(disc => {
                disc.remove();
            });
            
            // Remove all existing petals
            existingPetals.forEach(petal => {
                petal.remove();
            });
            
            // Clear any detached petals
            detachedPetals.forEach(petal => {
                petal.remove();
            });
        }
        
        // Reset petal arrays
        this.petals = [];
        this.detachedPetals = [];
        
        // Stop any running animations
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    // Check if a point is within swipe area (near disc)
    isInSwipeArea(x, y) {
        const dx = x - this.discX;
        const dy = y - this.discY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance <= this.swipeAreaRadius;
    }
    
    // Start continuous petal detachment during swiping
    startSwipeDetach() {
        // Clear any existing interval
        if (this.swipeDetachInterval) {
            clearInterval(this.swipeDetachInterval);
        }
        
        // Reset last detach time
        this.lastSwipeDetachTime = Date.now();
        
        // Start interval to detach petals continuously
        this.swipeDetachInterval = setInterval(() => {
            // Check if there are still attached petals
            const attachedPetals = this.petals.filter(p => p.attached);
            if (attachedPetals.length === 0) {
                // No more petals, stop interval
                this.stopSwipeDetach();
                return;
            }
            
            // Detach 1 petal randomly
            this.detachRandomPetals(1);
        }, this.swipeDetachIntervalMs);
    }
    
    // Stop continuous petal detachment during swiping
    stopSwipeDetach() {
        if (this.swipeDetachInterval) {
            clearInterval(this.swipeDetachInterval);
            this.swipeDetachInterval = null;
        }
        this.lastSwipeDetachTime = 0;
    }
    
    // Start continuous petal detachment during forceful disc dragging
    startDragDetach() {
        // Clear any existing interval
        if (this.dragDetachInterval) {
            clearInterval(this.dragDetachInterval);
        }
        
        // Reset last detach time
        this.lastDragDetachTime = Date.now();
        
        // Start interval to detach petals continuously during forceful dragging
        this.dragDetachInterval = setInterval(() => {
            // Check if still dragging
            if (!this.isDraggingDisc) {
                this.stopDragDetach();
                return;
            }
            
            // Check if there are still attached petals
            const attachedPetals = this.petals.filter(p => p.attached);
            if (attachedPetals.length === 0) {
                // No more petals, stop interval
                this.stopDragDetach();
                return;
            }
            
            // Detach 1 petal randomly
            this.detachRandomPetals(1);
        }, this.dragDetachIntervalMs);
    }
    
    // Stop continuous petal detachment during disc dragging
    stopDragDetach() {
        if (this.dragDetachInterval) {
            clearInterval(this.dragDetachInterval);
            this.dragDetachInterval = null;
        }
        this.lastDragDetachTime = 0;
    }
    
    // Update disc position to follow swipe (called during swipe movement)
    updateDiscFollowSwipe(fingerX, fingerY) {
        // Calculate distance from finger to original disc center (for string length)
        const dxFromOriginal = fingerX - this.originalDiscX;
        const dyFromOriginal = fingerY - this.originalDiscY;
        const distanceFromOriginal = Math.sqrt(dxFromOriginal * dxFromOriginal + dyFromOriginal * dyFromOriginal);
        
        // Check if finger is within swipe area
        if (distanceFromOriginal > this.swipeAreaRadius) {
            // Finger moved out of swipe radius - return disc to original position
            this.stopSwipeDetach(); // Stop continuous detachment
            this.startDiscSpring();
            return false;
        }
        
        // Start continuous detachment if not already started
        if (!this.swipeDetachInterval) {
            this.startSwipeDetach();
        }
        
        // Calculate follow strength based on distance (closer = stronger follow)
        // When finger is at disc center (distance = 0), follow strength = 1.5
        // When finger is at swipe area edge (distance = swipeAreaRadius), follow strength = 0.4
        const normalizedDistance = Math.min(distanceFromOriginal / this.swipeAreaRadius, 1.0);
        const followStrength = 1.5 - (normalizedDistance * 1.1); // Range from 1.5 (close) to 0.4 (far)
        
        // Calculate target position: disc should move towards finger
        // The closer the finger, the more the disc follows
        const targetX = this.originalDiscX + (fingerX - this.originalDiscX) * followStrength;
        const targetY = this.originalDiscY + (fingerY - this.originalDiscY) * followStrength;
        
        // Smoothly move disc towards target (like a string pulling)
        const pullSpeed = 0.3; // How fast disc follows (higher = faster)
        this.discX += (targetX - this.discX) * pullSpeed;
        this.discY += (targetY - this.discY) * pullSpeed;
        
        // Constrain to maintain stem length
        this.constrainDiscPosition();
        
        // Ensure disc size is at original
        this.discSize = this.originalDiscSize;
        
        // Update disc visual position and size
        this.discElement.style.left = `${this.discX - this.discSize / 2}px`;
        this.discElement.style.top = `${this.discY - this.discSize / 2}px`;
        this.discElement.style.width = `${this.discSize}px`;
        this.discElement.style.height = `${this.discSize}px`;
        
        // Update stem and petals
        this.updateStem();
        this.updatePetals();
        
        return true;
    }
    
    // Handle swipe gesture end
    handleSwipeEnd(startX, startY, endX, endY) {
        // Stop continuous detachment
        this.stopSwipeDetach();
        
        // Check if swipe started or ended near disc area
        const startInArea = this.isInSwipeArea(startX, startY);
        const endInArea = this.isInSwipeArea(endX, endY);
        
        if (!startInArea && !endInArea) {
            return false;
        }
        
        // Calculate swipe distance
        const dx = endX - startX;
        const dy = endY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Check if it's a valid swipe (minimum distance)
        if (distance < this.swipeThreshold) {
            // Still return disc to original if swipe was too short
            this.startDiscSpring();
            return false;
        }
        
        // Petals are already being detached continuously during swipe
        // No need to detach additional petals here
        
        // Start spring animation to return disc to original position
        this.startDiscSpring();
        
        return true;
    }
    
    constrainDiscPosition() {
        // Constrain disc position to maintain FIXED STEM LENGTH
        // The stem must maintain exact fixed length, so constrain disc accordingly
        const startX = this.stemBottomX;
        const startY = this.stemBottomY;
        
        // Calculate current straight-line distance from stem bottom to disc
        const dx = this.discX - startX;
        const dy = this.discY - startY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);
        
        // For a quadratic bezier with bend at 1/3, the arc length is always >= straight-line distance
        // To maintain fixed length, the straight-line distance must be <= fixedLength
        // However, we can bend to achieve fixed length even if straight distance is slightly less
        // Conservative estimate: max straight distance is about 1.1x fixed length with maximum bending
        // But to be safe and prevent ANY stretching, limit to fixedLength itself
        const maxAllowedDistance = this.fixedStemLength * 1.05; // 5% tolerance for bending
        
        if (currentDistance > maxAllowedDistance) {
            // Constrain disc to maintain stem length - scale back
            const scale = maxAllowedDistance / currentDistance;
            this.discX = startX + dx * scale;
            this.discY = startY + dy * scale;
        }
        
        // Also apply movement constraint due to stem hardness (5% response)
        const movementDx = this.discX - this.originalDiscX;
        const movementDy = this.discY - this.originalDiscY;
        const movementDistance = Math.sqrt(movementDx * movementDx + movementDy * movementDy);
        
        if (movementDistance > this.maxDiscMovement) {
            // Scale back to max movement
            const scale = this.maxDiscMovement / movementDistance;
            this.discX = this.originalDiscX + movementDx * scale;
            this.discY = this.originalDiscY + movementDy * scale;
        }
        
        // Extra constraint: prevent dragging down too much
        const maxDownwardMovement = this.maxDiscMovement * 0.5;
        if (this.discY > this.originalDiscY + maxDownwardMovement) {
            this.discY = this.originalDiscY + maxDownwardMovement;
        }
    }
    
    startPhysicsLoop() {
        const animate = () => {
            this.updateFallingPetals();
            this.updateDiscSpring();
            this.updateTapAnimation();
            this.animationFrameId = requestAnimationFrame(animate);
        };
        animate();
    }
    
    triggerTapAnimation() {
        // If animation is already active, reset it first to prevent accumulation
        if (this.tapAnimationActive) {
            // Reset disc size immediately to original before starting new animation
            this.discSize = this.originalDiscSize;
            this.discX = this.originalDiscX;
            this.discY = this.originalDiscY;
            
            // Reset petals
            this.petals.forEach(petal => {
                if (petal.attached) {
                    petal.currentLength = petal.baseLength;
                    petal.swingAngle = 0;
                    petal.tapSizeMultiplier = null;
                    petal.tapSwingAngle = null;
                }
            });
        }
        
        // Start tap animation
        this.tapAnimationActive = true;
        this.tapAnimationStartTime = Date.now();
        
        // Always use the true original disc size (never use current size)
        // Ensure disc size is reset to original before starting animation
        this.discSize = this.originalDiscSize;
        
        // Calculate random direction for disc movement (5% distance)
        const randomAngle = Math.random() * Math.PI * 2;
        const moveDistance = this.fixedStemLength * 0.05; // 5% of stem length
        
        // Store target position for disc
        this.tapDiscTargetX = this.originalDiscX + Math.cos(randomAngle) * moveDistance;
        this.tapDiscTargetY = this.originalDiscY + Math.sin(randomAngle) * moveDistance;
        
        // Increase all attached petals' size by 15%
        this.petals.forEach(petal => {
            if (petal.attached) {
                petal.tapSizeMultiplier = 1.15; // 15% increase
                // Add random swing to each petal (±10 degrees)
                petal.tapSwingAngle = (Math.random() - 0.5) * 20; // Random swing ±10 degrees
            }
        });
    }
    
    updateTapAnimation() {
        if (!this.tapAnimationActive) return;
        
        const elapsed = Date.now() - this.tapAnimationStartTime;
        const progress = Math.min(elapsed / this.tapAnimationDuration, 1.0);
        
        // Easing function (ease out)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        if (progress < 1.0) {
            // Animate disc size: increase then decrease (max 10% increase)
            const discSizeProgress = progress < 0.5 ? progress * 2 : 1 - (progress - 0.5) * 2;
            const discSizeMultiplier = 1 + 0.10 * discSizeProgress; // 10% increase (reduced from 15%)
            this.discSize = this.originalDiscSize * discSizeMultiplier;
            
            // Animate disc movement
            const discProgress = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7;
            const discEase = discProgress < 0.5 ? 2 * discProgress * discProgress : 1 - Math.pow(-2 * discProgress + 2, 2) / 2;
            
            this.discX = this.originalDiscX + (this.tapDiscTargetX - this.originalDiscX) * discEase;
            this.discY = this.originalDiscY + (this.tapDiscTargetY - this.originalDiscY) * discEase;
            
            // Update disc visual position and size
            this.discElement.style.left = `${this.discX - this.discSize / 2}px`;
            this.discElement.style.top = `${this.discY - this.discSize / 2}px`;
            this.discElement.style.width = `${this.discSize}px`;
            this.discElement.style.height = `${this.discSize}px`;
            
            // Update stem
            this.updateStem();
            
            // Animate petals: size and swing
            this.petals.forEach(petal => {
                if (petal.attached && petal.tapSizeMultiplier) {
                    // Size animation: increase then decrease
                    const sizeProgress = progress < 0.5 ? progress * 2 : 1 - (progress - 0.5) * 2;
                    const currentSizeMultiplier = 1 + (petal.tapSizeMultiplier - 1) * sizeProgress;
                    petal.currentLength = petal.baseLength * currentSizeMultiplier;
                    
                    // Swing animation: swing then return
                    const swingProgress = progress < 0.5 ? progress * 2 : 1 - (progress - 0.5) * 2;
                    petal.swingAngle = petal.tapSwingAngle * swingProgress;
                }
            });
            
            // Update petals
            this.updatePetals();
        } else {
            // Animation complete, reset everything
            this.tapAnimationActive = false;
            
            // Reset disc size and position
            this.discSize = this.originalDiscSize;
            this.discX = this.originalDiscX;
            this.discY = this.originalDiscY;
            this.discElement.style.left = `${this.discX - this.discSize / 2}px`;
            this.discElement.style.top = `${this.discY - this.discSize / 2}px`;
            this.discElement.style.width = `${this.discSize}px`;
            this.discElement.style.height = `${this.discSize}px`;
            
            // Reset petals
            this.petals.forEach(petal => {
                if (petal.attached) {
                    petal.currentLength = petal.baseLength;
                    petal.swingAngle = 0;
                    petal.tapSizeMultiplier = null;
                    petal.tapSwingAngle = null;
                }
            });
            
            // Final updates
            this.updateStem();
            this.updatePetals();
        }
    }
    
    updateDiscSpring() {
        if (!this.discSpringActive) return;
        
        // Calculate distance from original position
        const dx = this.originalDiscX - this.discX;
        const dy = this.originalDiscY - this.discY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Smooth linear return without bouncing
        // Use easing factor for smooth return
        const returnSpeed = 0.08; // Speed of return (higher = faster)
        
        if (distance > 0.1) {
            // Move towards original position smoothly
            this.discX += dx * returnSpeed;
            this.discY += dy * returnSpeed;
            
            // Constrain disc position to maintain fixed stem length
            this.constrainDiscPosition();
            
            // Ensure disc size is at original (in case tap animation changed it)
            this.discSize = this.originalDiscSize;
            
            // Update visual position
            this.discElement.style.left = `${this.discX - this.discSize / 2}px`;
            this.discElement.style.top = `${this.discY - this.discSize / 2}px`;
            this.discElement.style.width = `${this.discSize}px`;
            this.discElement.style.height = `${this.discSize}px`;
            
            // Update stem
            this.updateStem();
            
            // Update petals
            this.updatePetals();
        } else {
            // Snap to original position when close enough
            this.discX = this.originalDiscX;
            this.discY = this.originalDiscY;
            this.discSize = this.originalDiscSize; // Ensure original size
            this.discSpringActive = false;
            
            // Final update
            this.discElement.style.left = `${this.discX - this.discSize / 2}px`;
            this.discElement.style.top = `${this.discY - this.discSize / 2}px`;
            this.discElement.style.width = `${this.discSize}px`;
            this.discElement.style.height = `${this.discSize}px`;
            this.updateStem();
            this.updatePetals();
        }
    }
    
    startDiscSpring() {
        this.discSpringActive = true;
    }
    
    pullDiscToward(x, y, strength = null) {
        if (this.isDraggingDisc) return; // Don't pull if disc is being dragged
        
        const pullStrength = strength || this.discPullStrength;
        
        // Calculate pull direction from original position
        const dx = x - this.originalDiscX;
        const dy = y - this.originalDiscY;
        
        // Move disc from original position toward the pull direction
        this.discX = this.originalDiscX + dx * pullStrength;
        this.discY = this.originalDiscY + dy * pullStrength;
        
        // Constrain disc position due to stem hardness
        this.constrainDiscPosition();
        
        // Ensure disc size is at original (in case tap animation changed it)
        this.discSize = this.originalDiscSize;
        
        // Update visual position
        this.discElement.style.left = `${this.discX - this.discSize / 2}px`;
        this.discElement.style.top = `${this.discY - this.discSize / 2}px`;
        this.discElement.style.width = `${this.discSize}px`;
        this.discElement.style.height = `${this.discSize}px`;
        
        // Update stem and petals
        this.updateStem();
        this.updatePetals();
    }
    
    stopPhysicsLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    createStem() {
        // Stem SVG is already in HTML, just update the path
        // Set SVG viewBox to match container
        if (this.stemSVG) {
            // Update container dimensions in case they changed
            const containerRect = this.container.getBoundingClientRect();
            this.containerWidth = containerRect.width || window.innerWidth;
            this.containerHeight = containerRect.height || window.innerHeight;
            
            this.stemSVG.setAttribute('viewBox', `0 0 ${this.containerWidth} ${this.containerHeight}`);
            this.stemSVG.setAttribute('width', this.containerWidth);
            this.stemSVG.setAttribute('height', this.containerHeight);
        }
        this.updateStem();
    }
    
    // Calculate approximate arc length of a cubic bezier curve
    calculateBezierLength(x0, y0, x1, y1, x2, y2, x3, y3) {
        // Use numerical integration with multiple points
        let length = 0;
        const steps = 50;
        let prevX = x0;
        let prevY = y0;
        
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;
            const t2 = t * t;
            const t3 = t2 * t;
            
            const x = mt3 * x0 + 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t3 * x3;
            const y = mt3 * y0 + 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t3 * y3;
            
            const dx = x - prevX;
            const dy = y - prevY;
            length += Math.sqrt(dx * dx + dy * dy);
            
            prevX = x;
            prevY = y;
        }
        
        return length;
    }
    
    updateStem() {
        // Create stem with rigid bottom third and flexible top two-thirds
        // Bottom 1/3: rigid, straight, cannot move
        // Top 2/3: can bend, but maintains fixed total length
        const startX = this.stemBottomX;
        const startY = this.stemBottomY;
        const endX = this.discX;
        const endY = this.discY;
        
        // Calculate original direction (for rigid bottom third)
        const origDx = this.originalDiscX - startX;
        const origDy = this.originalDiscY - startY;
        const origDistance = Math.sqrt(origDx * origDx + origDy * origDy);
        
        // Bend point is at 1/3 of fixed stem length from bottom
        const bendT = 0.333333; // Exactly 1/3
        const bottomThirdLength = this.fixedStemLength * bendT; // Length of rigid bottom third
        const topTwoThirdsLength = this.fixedStemLength * (1 - bendT); // Length of flexible top 2/3
        
        // Calculate rigid bottom third endpoint (always straight, follows original direction)
        // This point is fixed relative to the original stem direction
        const bottomThirdDx = origDx * (bottomThirdLength / origDistance);
        const bottomThirdDy = origDy * (bottomThirdLength / origDistance);
        const bendPointX = startX + bottomThirdDx;
        const bendPointY = startY + bottomThirdDy;
        
        // Calculate direction from bend point to disc
        const topDx = endX - bendPointX;
        const topDy = endY - bendPointY;
        const topDistance = Math.sqrt(topDx * topDx + topDy * topDy);
        
        // If top distance is 0, use straight line
        if (topDistance < 0.1) {
            const pathData = `M ${startX} ${startY} L ${bendPointX} ${bendPointY} L ${endX} ${endY}`;
            this.stemPath.setAttribute('d', pathData);
            return;
        }
        
        // Apply stiffness - reduce how much movement affects bending (5% response)
        // Calculate movement from original disc position
        const movementDx = endX - this.originalDiscX;
        const movementDy = endY - this.originalDiscY;
        
        // Apply stiffness factor - only 5% of movement causes bending
        const effectiveMovementDx = movementDx * this.stemStiffness;
        const effectiveMovementDy = movementDy * this.stemStiffness;
        
        // Effective disc position (with stiffness applied)
        const effectiveEndX = this.originalDiscX + effectiveMovementDx;
        const effectiveEndY = this.originalDiscY + effectiveMovementDy;
        
        // Calculate effective direction from bend point to effective disc
        const effectiveTopDx = effectiveEndX - bendPointX;
        const effectiveTopDy = effectiveEndY - bendPointY;
        const effectiveTopDistance = Math.sqrt(effectiveTopDx * effectiveTopDx + effectiveTopDy * effectiveTopDy);
        
        // Perpendicular direction for curvature (normalized)
        const perpX = effectiveTopDistance > 0 ? -effectiveTopDy / effectiveTopDistance : 0;
        const perpY = effectiveTopDistance > 0 ? effectiveTopDx / effectiveTopDistance : 0;
        
        // Direction of bottom half (for smooth transition)
        const bottomDirX = origDx / origDistance;
        const bottomDirY = origDy / origDistance;
        
        // Curve point is at 1/2 of the upper 2/3 = 2/3 of total stem length
        // Top 2/3 starts at 1/3, curve point at 1/3 + (2/3 * 0.5) = 2/3
        const curvePointT = 0.666667; // 2/3 of total stem = 1/2 of upper 2/3
        const curvePointDist = this.fixedStemLength * curvePointT;
        const curvePointX = startX + origDx * (curvePointDist / origDistance);
        const curvePointY = startY + origDy * (curvePointDist / origDistance);
        
        // Binary search for curvature that gives EXACTLY the fixed top 2/3 length
        // Use cubic bezier for smooth curved bending with more pronounced curve
        let minCurvature = 0;
        let maxCurvature = 400; // Increased max curvature for more obvious curve
        let bestCurvature = 0;
        let bestDiff = Infinity;
        
        // If straight line distance is already close to top 2/3 length, use minimal curvature
        if (Math.abs(effectiveTopDistance - topTwoThirdsLength) < 0.05) {
            bestCurvature = 0;
        } else {
            // Binary search for correct curvature
            for (let iter = 0; iter < 40; iter++) {
                const curvature = (minCurvature + maxCurvature) / 2;
                
                // First control point: very close to bend point (1/3) for smooth transition
                // Positioned to create a smooth curve right at the transition
                const cp1Dist = topTwoThirdsLength * 0.08; // 8% along top 2/3, very close to bend point
                // Increase curvature multiplier for smoother transition
                const transitionCurvature = curvature * 0.8; // Strong curve at transition
                const cp1X = bendPointX + bottomDirX * cp1Dist + perpX * transitionCurvature;
                const cp1Y = bendPointY + bottomDirY * cp1Dist + perpY * transitionCurvature;
                
                // Second control point: positioned at curve point (1/2 of upper 2/3 = 2/3 total)
                // This creates the most pronounced curve at this point
                const curvePointOffset = curvePointDist - bottomThirdLength; // Distance from bend point to curve point
                const cp2X = bendPointX + effectiveTopDx * (curvePointOffset / effectiveTopDistance) + perpX * curvature * 1.5;
                const cp2Y = bendPointY + effectiveTopDy * (curvePointOffset / effectiveTopDistance) + perpY * curvature * 1.5;
                
                // Calculate arc length of top 2/3 using cubic bezier
                const topArcLength = this.calculateBezierLength(bendPointX, bendPointY, cp1X, cp1Y, cp2X, cp2Y, effectiveEndX, effectiveEndY);
                const totalLength = bottomThirdLength + topArcLength;
                const diff = Math.abs(totalLength - this.fixedStemLength);
                
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestCurvature = curvature;
                }
                
                if (totalLength < this.fixedStemLength) {
                    // Need more curvature to increase length
                    minCurvature = curvature;
                } else {
                    // Need less curvature to decrease length
                    maxCurvature = curvature;
                }
                
                if (diff < 0.1) break; // Close enough
            }
        }
        
        // Final control points - scale to actual disc position
        const actualTopDirX = topDx / topDistance;
        const actualTopDirY = topDy / topDistance;
        
        // Scale curvature to account for stiffness, but increase multiplier for more obvious curve
        const curvatureScale = topDistance > 0 ? (effectiveTopDistance / topDistance) * this.stemStiffness * 2.0 : this.stemStiffness * 2.0;
        const scaledCurvature = bestCurvature * curvatureScale;
        
        // First control point: smooth transition from bottom third at 1/3 point
        // Positioned very close to bend point with increased curvature for natural transition
        const cp1Dist = topTwoThirdsLength * 0.08; // Very close to bend point (8% along top 2/3)
        const transitionCurvature = scaledCurvature * 0.8; // Strong curve at transition point
        const cp1X = bendPointX + bottomDirX * cp1Dist + perpX * transitionCurvature;
        const cp1Y = bendPointY + bottomDirY * cp1Dist + perpY * transitionCurvature;
        
        // Second control point: positioned at curve point (1/2 of upper 2/3) for maximum curve
        const curvePointOffset = curvePointDist - bottomThirdLength;
        const cp2X = bendPointX + actualTopDirX * curvePointOffset + perpX * scaledCurvature * 1.5;
        const cp2Y = bendPointY + actualTopDirY * curvePointOffset + perpY * scaledCurvature * 1.5;
        
        // Create path: straight line (rigid bottom) + smooth curved line (flexible top)
        // L = line, C = cubic bezier (smooth curve with pronounced bend at 1/2 of upper half)
        const pathData = `M ${startX} ${startY} L ${bendPointX} ${bendPointY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
        this.stemPath.setAttribute('d', pathData);
    }
    
    // Calculate approximate arc length of a quadratic bezier curve
    calculateQuadraticBezierLength(x0, y0, x1, y1, x2, y2) {
        let length = 0;
        const steps = 50;
        let prevX = x0;
        let prevY = y0;
        
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const t2 = t * t;
            
            const x = mt2 * x0 + 2 * mt * t * x1 + t2 * x2;
            const y = mt2 * y0 + 2 * mt * t * y1 + t2 * y2;
            
            const dx = x - prevX;
            const dy = y - prevY;
            length += Math.sqrt(dx * dx + dy * dy);
            
            prevX = x;
            prevY = y;
        }
        
        return length;
    }
    
    createDisc() {
        // CRITICAL: Ensure no existing disc before creating new one
        const existingDisc = this.container.querySelector('.flower-disc');
        if (existingDisc) {
            console.warn(`🌸 Existing disc found, removing before creating new one`);
            existingDisc.remove();
        }
        
        const disc = document.createElement('img');
        disc.src = 'Disc.png';
        disc.className = 'flower-disc';
        disc.id = 'flowerDisc';
        
        // Set explicit size immediately to prevent initial smaller size
        disc.style.width = `${this.discSize}px`;
        disc.style.height = `${this.discSize}px`;
        disc.style.left = `${this.discX - this.discSize / 2}px`;
        disc.style.top = `${this.discY - this.discSize / 2}px`;
        
        // Ensure size is set after image loads (in case image hasn't loaded yet)
        disc.addEventListener('load', () => {
            disc.style.width = `${this.discSize}px`;
            disc.style.height = `${this.discSize}px`;
        });
        
        this.discElement = disc;
        this.container.appendChild(disc);
        
        // Disc drag handlers
        disc.addEventListener('mousedown', (e) => this.startDiscDrag(e));
        disc.addEventListener('touchstart', (e) => this.startDiscDrag(e), { passive: false });
    }
    
    startDiscDrag(e) {
        e.preventDefault();
        this.isDraggingDisc = true;
        this.isTap = true; // Assume it's a tap until movement is detected
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        // Record tap start time and position
        this.tapStartTime = Date.now();
        this.tapStartPosition.x = clientX;
        this.tapStartPosition.y = clientY;
        
        // Initialize last drag position for velocity calculation
        this.lastDragPosition.x = this.discX;
        this.lastDragPosition.y = this.discY;
        
        const rect = this.discElement.getBoundingClientRect();
        this.dragOffset.x = clientX - (rect.left + rect.width / 2);
        this.dragOffset.y = clientY - (rect.top + rect.height / 2);
        
        document.addEventListener('mousemove', this.handleDiscDrag);
        document.addEventListener('mouseup', this.stopDiscDrag);
        document.addEventListener('touchmove', this.handleDiscDrag, { passive: false });
        document.addEventListener('touchend', this.stopDiscDrag);
    }
    
    handleDiscDrag = (e) => {
        if (!this.isDraggingDisc) return;
        e.preventDefault();
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        // Check if this is a tap (minimal movement) or a drag
        const moveDistance = Math.sqrt(
            Math.pow(clientX - this.tapStartPosition.x, 2) + 
            Math.pow(clientY - this.tapStartPosition.y, 2)
        );
        
        // If moved more than 10 pixels, it's a drag, not a tap
        if (moveDistance > 10) {
            this.isTap = false;
        }
        
        // Stop spring animation while dragging
        this.discSpringActive = false;
        
        // Update disc position
        const newDiscX = clientX - this.dragOffset.x;
        const newDiscY = clientY - this.dragOffset.y;
        
        // Calculate drag velocity (movement per frame)
        const dx = newDiscX - this.lastDragPosition.x;
        const dy = newDiscY - this.lastDragPosition.y;
        const dragVelocity = Math.sqrt(dx * dx + dy * dy);
        
        // Update last drag position
        this.lastDragPosition.x = newDiscX;
        this.lastDragPosition.y = newDiscY;
        
        this.discX = newDiscX;
        this.discY = newDiscY;
        
        // Update container dimensions in case they changed
        const containerRect = this.container.getBoundingClientRect();
        this.containerWidth = containerRect.width || window.innerWidth;
        this.containerHeight = containerRect.height || window.innerHeight;
        
        // Constrain to container bounds
        const maxX = this.containerWidth - this.discSize / 2;
        const minX = this.discSize / 2;
        const maxY = this.containerHeight - this.discSize / 2;
        const minY = this.discSize / 2;
        
        this.discX = Math.max(minX, Math.min(maxX, this.discX));
        this.discY = Math.max(minY, Math.min(maxY, this.discY));
        
        // Constrain disc position due to stem hardness
        this.constrainDiscPosition();
        
        // Ensure disc size is at original (in case tap animation changed it)
        this.discSize = this.originalDiscSize;
        
        // Check if dragging is forceful (high velocity)
        if (dragVelocity > this.dragVelocityThreshold) {
            // Start continuous detachment if not already started
            if (!this.dragDetachInterval) {
                this.startDragDetach();
            }
        } else {
            // If velocity drops below threshold, stop detachment
            this.stopDragDetach();
        }
        
        // Update disc visual position
        this.discElement.style.left = `${this.discX - this.discSize / 2}px`;
        this.discElement.style.top = `${this.discY - this.discSize / 2}px`;
        this.discElement.style.width = `${this.discSize}px`;
        this.discElement.style.height = `${this.discSize}px`;
        
        // Update stem
        this.updateStem();
        
        // Update petals
        this.updatePetals();
    }
    
    stopDiscDrag = (e) => {
        this.isDraggingDisc = false;
        
        // Stop continuous detachment during drag
        this.stopDragDetach();
        
        // If it was a tap (not a drag), trigger tap effects
        if (this.isTap) {
            // Trigger tap animation: increase petal size, swing petals, move disc
            this.triggerTapAnimation();
            
            // Calculate tap force/pressure
            let force = 0.5; // Default force for mouse clicks
            
            if (e && e.changedTouches && e.changedTouches.length > 0) {
                // Try to get force/pressure from touch event
                const touch = e.changedTouches[0];
                if (touch.force !== undefined && touch.force > 0) {
                    force = touch.force; // 0.0 to 1.0
                } else if (touch.pressure !== undefined && touch.pressure > 0) {
                    force = touch.pressure; // 0.0 to 1.0
                } else {
                    // Use tap duration as proxy for force (longer press = more force)
                    const tapDuration = Date.now() - this.tapStartTime;
                    force = Math.min(1.0, tapDuration / 300); // Max force at 300ms
                }
            } else {
                // For mouse clicks, use tap duration
                const tapDuration = Date.now() - this.tapStartTime;
                force = Math.min(1.0, tapDuration / 300); // Max force at 300ms
            }
            
            // Calculate number of petals to detach (1-3 based on force)
            // Force 0.0-0.33 = 1 petal, 0.33-0.66 = 2 petals, 0.66-1.0 = 3 petals
            let numToDetach = 1;
            if (force > 0.66) {
                numToDetach = 3;
            } else if (force > 0.33) {
                numToDetach = 2;
            }
            
            // Detach random petals after a short delay (during animation)
            setTimeout(() => {
                this.detachRandomPetals(numToDetach);
            }, 100);
        } else {
            // Start spring animation to bounce back to original position
            this.startDiscSpring();
        }
        
        document.removeEventListener('mousemove', this.handleDiscDrag);
        document.removeEventListener('mouseup', this.stopDiscDrag);
        document.removeEventListener('touchmove', this.handleDiscDrag);
        document.removeEventListener('touchend', this.stopDiscDrag);
    }
    
    detachRandomPetals(count) {
        // Get only attached petals
        const attachedPetals = this.petals.filter(p => p.attached);
        
        if (attachedPetals.length === 0) return;
        
        // Limit count to available petals
        const numToDetach = Math.min(count, attachedPetals.length);
        
        // Shuffle array and take first N petals
        const shuffled = [...attachedPetals].sort(() => Math.random() - 0.5);
        const petalsToDetach = shuffled.slice(0, numToDetach);
        
        // Detach each petal
        petalsToDetach.forEach(petal => {
            // Calculate random direction for falling
            const angle = Math.random() * Math.PI * 2;
            const releaseX = this.discX + Math.cos(angle) * 50;
            const releaseY = this.discY + Math.sin(angle) * 50;
            
            this.detachPetal(petal, releaseX, releaseY);
        });
    }
    
    createPetals(preserveAnswer = false) {
        const savedFinalAnswer = preserveAnswer ? this.finalAnswer : null;
        
        // CRITICAL: Clear existing petals from both array and DOM
        this.petals.forEach(petal => {
            if (petal.element && petal.element.parentNode) {
                petal.element.remove();
            }
        });
        this.petals = [];
        if (!preserveAnswer) this.finalAnswer = null;
        this.answerDisplayed = false; // Always reset so user can play again
        
        if (this.container) {
            this.container.querySelectorAll('.detached-petal').forEach(el => el.remove());
        }
        this.detachedPetals = [];
        
        // CRITICAL: Also remove any existing petal elements from DOM that might not be in array
        if (this.container) {
            const existingPetals = this.container.querySelectorAll('.flower-petal');
            existingPetals.forEach(petal => {
                console.warn(`🌸 Removing existing petal element from DOM before creating new petals`);
                petal.remove();
            });
        }
        
        // CRITICAL: Validate and clamp numPetals before creating petals
        // This is a final safeguard to ensure we never exceed limits
        const requestedPetals = this.numPetals || 20;
        this.numPetals = Math.max(12, Math.min(30, Math.floor(requestedPetals)));
        if (requestedPetals !== this.numPetals) {
            console.error(`🌸 CRITICAL: Petal count was ${requestedPetals}, clamped to ${this.numPetals} (valid range: 12-30)`);
        }
        
        // Assign YES/NO to petals: preserve pattern when resetting, else random
        const startAnswer = preserveAnswer && savedFinalAnswer
            ? (savedFinalAnswer === 'YES' ? 'NO' : 'YES') // last petal (odd index) = opposite of start
            : Math.random() < 0.5 ? 'YES' : 'NO';
        
        const angleStep = (2 * Math.PI) / this.numPetals;
        
        // Final safeguard: ensure we never create more than 30 petals
        const maxPetals = Math.min(30, this.numPetals);
        const minPetals = Math.max(12, maxPetals);
        const actualPetals = Math.max(12, Math.min(30, maxPetals));
        
        if (actualPetals !== this.numPetals) {
            console.error(`🌸 CRITICAL: Adjusted petal count from ${this.numPetals} to ${actualPetals}`);
            this.numPetals = actualPetals;
        }
        
        for (let i = 0; i < this.numPetals; i++) {
            // Additional safeguard: never create more than 30 petals
            if (i >= 30) {
                console.error(`🌸 CRITICAL: Stopping petal creation at index ${i} to prevent exceeding 30 petals`);
                break;
            }
            
            const angle = i * angleStep;
            // Alternate answer: if start is YES, then YES, NO, YES, NO...
            // If start is NO, then NO, YES, NO, YES...
            const answer = (i % 2 === 0) ? startAnswer : (startAnswer === 'YES' ? 'NO' : 'YES');
            const petal = this.createPetal(angle, i, answer);
            this.petals.push(petal);
            
            // Growth animation when resetting (same as regrowMissingPetals)
            if (preserveAnswer) {
                this.updatePetal(petal);
                const baseTransform = petal.element.style.transform;
                petal.element.style.transform = baseTransform + ' scale(0)';
                petal.element.style.opacity = '0';
                petal.element.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease-out';
                setTimeout(() => {
                    requestAnimationFrame(() => {
                        petal.element.style.opacity = '1';
                        petal.element.style.transform = baseTransform + ' scale(1)';
                        setTimeout(() => {
                            petal.element.style.transition = '';
                            this.updatePetal(petal);
                        }, 600);
                    });
                }, i * 80); // Stagger each petal by 80ms
            }
        }
        
        if (!preserveAnswer) this.updatePetals();
        
        // Verify we didn't exceed limits
        if (this.petals.length > 30) {
            console.error(`🌸 CRITICAL ERROR: Created ${this.petals.length} petals, removing excess`);
            const excess = this.petals.splice(30);
            excess.forEach(petal => {
                if (petal.element && petal.element.parentNode) {
                    petal.element.remove();
                }
            });
        }
        
        if (this.petals.length < 12) {
            console.error(`🌸 CRITICAL ERROR: Only ${this.petals.length} petals created, expected at least 12`);
        }
        
        // Store the final answer (last petal's answer)
        if (this.petals.length > 0) {
            this.finalAnswer = this.petals[this.petals.length - 1].answer;
        }
        
        if (!preserveAnswer) this.updatePetals();
    }
    
    regrowMissingPetals() {
        // CRITICAL: Validate numPetals before regrowing
        const requestedPetals = this.numPetals || 20;
        this.numPetals = Math.max(12, Math.min(30, Math.floor(requestedPetals)));
        
        // Identify which petal indices are missing (only check attached petals)
        // We want to regrow petals that were detached, so we check what's currently attached
        const angleStep = (2 * Math.PI) / this.numPetals;
        const attachedIndices = new Set(this.petals.map(p => p.index));
        const missingIndices = [];
        
        // Find all indices that should exist but aren't attached
        // Safeguard: never exceed 30 petals total
        const maxAllowedIndex = Math.min(29, this.numPetals - 1); // 0-indexed, so max is 29 for 30 petals
        for (let i = 0; i <= maxAllowedIndex; i++) {
            if (!attachedIndices.has(i)) {
                missingIndices.push(i);
            }
        }
        
        if (missingIndices.length === 0) {
            return; // No missing petals
        }
        
        // Determine the starting answer for regrown petals
        // If we have existing petals, use the first petal's answer pattern
        // Otherwise, start randomly
        let startAnswer;
        if (this.petals.length > 0) {
            // Find the pattern from existing petals
            const firstExistingIndex = Math.min(...this.petals.map(p => p.index));
            startAnswer = this.petals.find(p => p.index === firstExistingIndex)?.answer;
            if (!startAnswer) {
                startAnswer = Math.random() < 0.5 ? 'YES' : 'NO';
            }
        } else {
            startAnswer = Math.random() < 0.5 ? 'YES' : 'NO';
        }
        
        // Create missing petals with growth animation
        // CRITICAL: Ensure we never exceed 30 petals total
        const currentPetalCount = this.petals.length;
        const maxCanAdd = 30 - currentPetalCount;
        const indicesToRegrow = missingIndices.slice(0, maxCanAdd);
        
        indicesToRegrow.forEach((index, delayIndex) => {
            // Additional safeguard: never exceed index 29 (30th petal)
            if (index >= 30) {
                console.error(`🌸 CRITICAL: Skipping regrow for index ${index} to prevent exceeding 30 petals`);
                return;
            }
            
            // Additional safeguard: check current count before adding
            if (this.petals.length >= 30) {
                console.error(`🌸 CRITICAL: Already have ${this.petals.length} petals, stopping regrow`);
                return;
            }
            
            const angle = index * angleStep;
            // Assign answer based on index (alternating from startAnswer)
            const answer = (index % 2 === 0) ? startAnswer : (startAnswer === 'YES' ? 'NO' : 'YES');
            const petal = this.createPetal(angle, index, answer);
            
            // Set initial position (this will set the transform)
            this.updatePetal(petal);
            
            // Store the base transform
            const baseTransform = petal.element.style.transform;
            
            // Start with overall scale 0 and opacity 0 for growth animation
            // Append scale(0) to the existing transform
            petal.element.style.transform = baseTransform + ' scale(0)';
            petal.element.style.opacity = '0';
            petal.element.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease-out';
            
            // Animate growth after a slight delay (staggered animation)
            setTimeout(() => {
                requestAnimationFrame(() => {
                    petal.element.style.opacity = '1';
                    // Animate to scale 1 (append scale(1) to transform)
                    petal.element.style.transform = baseTransform + ' scale(1)';
                    
                    // After animation completes, remove transition and the scale modifier
                    setTimeout(() => {
                        petal.element.style.transition = '';
                        // Remove the scale modifier, keep only the base transform
                        // The base transform will be maintained by updatePetal calls
                        this.updatePetal(petal);
                    }, 600);
                });
            }, delayIndex * 100); // Stagger each petal by 100ms
            
            this.petals.push(petal);
        });
        
        // Final verification: remove any excess petals if somehow we exceeded 30
        if (this.petals.length > 30) {
            console.error(`🌸 CRITICAL ERROR: After regrow, have ${this.petals.length} petals, removing excess`);
            const excess = this.petals.splice(30);
            excess.forEach(petal => {
                if (petal.element && petal.element.parentNode) {
                    petal.element.remove();
                }
            });
        }
        
        // Sort petals by index to maintain order
        this.petals.sort((a, b) => a.index - b.index);
        
        // Update final answer (last petal's answer)
        if (this.petals.length > 0) {
            const lastPetal = this.petals[this.petals.length - 1];
            this.finalAnswer = lastPetal.answer;
        }
    }
    
    createPetal(angle, index, answer = null) {
        const petalElement = document.createElement('img');
        petalElement.src = 'Petal.png';
        petalElement.className = 'flower-petal';
        petalElement.setAttribute('data-index', index);
        petalElement.setAttribute('data-angle', angle);
        
        // Set explicit fixed petal size (maintains ratio with disc)
        // Petal height: 80px (fixed, maintains ratio with 120px disc)
        petalElement.style.height = '80px';
        petalElement.style.width = 'auto'; // Maintain aspect ratio
        
        // Ensure size is set after image loads
        petalElement.addEventListener('load', () => {
            petalElement.style.height = '80px';
            petalElement.style.width = 'auto';
        });
        
        this.container.appendChild(petalElement);
        
        // Set z-index based on petal number (1-based): even numbers on top, odd numbers behind
        // Index is 0-based, so petal number = index + 1
        // Even petal numbers (2, 4, 6...) -> higher z-index (on top)
        // Odd petal numbers (1, 3, 5...) -> lower z-index (behind)
        const petalNumber = index + 1;
        if (petalNumber % 2 === 0) {
            // Even number - on top
            petalElement.style.zIndex = '5';
        } else {
            // Odd number - behind
            petalElement.style.zIndex = '3';
        }
        
        // Base length should be the petal radius (distance from disc edge)
        const discRadius = this.discSize / 2;
        const baseLength = this.petalRadius;
        
        const petal = {
            element: petalElement,
            angle: angle,
            index: index,
            answer: answer, // YES or NO assigned to this petal
            baseLength: baseLength,
            currentLength: baseLength,
            baseRotation: (angle * 180) / Math.PI,
            attached: true, // Whether petal is still attached to disc
            maxLength: baseLength * this.maxStretchFactor, // Max length before detachment
            swingAngle: 0, // Current swing angle in degrees (up to ±20 degrees)
            maxSwingAngle: 20 // Maximum swing angle in degrees
        };
        
        // Petal stretch handlers
        petalElement.addEventListener('mousedown', (e) => this.startPetalStretch(e, petal));
        petalElement.addEventListener('touchstart', (e) => this.startPetalStretch(e, petal), { passive: false });
        
        return petal;
    }
    
    startPetalStretch(e, petal) {
        e.preventDefault();
        e.stopPropagation(); // Prevent disc drag
        
        this.stretchingPetal = petal;
        petal.element.classList.add('stretching');
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        // Calculate distance from disc center to touch point
        const dx = clientX - this.discX;
        const dy = clientY - this.discY;
        this.stretchStartDistance = Math.sqrt(dx * dx + dy * dy);
        this.stretchStartLength = petal.currentLength;
        
        document.addEventListener('mousemove', this.handlePetalStretch);
        document.addEventListener('mouseup', this.stopPetalStretch);
        document.addEventListener('touchmove', this.handlePetalStretch, { passive: false });
        document.addEventListener('touchend', (e) => this.stopPetalStretch(e));
    }
    
    handlePetalStretch = (e) => {
        if (!this.stretchingPetal) return;
        
        // If petal was detached, stop handling
        if (!this.stretchingPetal.attached) {
            this.stopPetalStretch(e);
            return;
        }
        
        e.preventDefault();
        
        // Stop spring animation while stretching
        this.discSpringActive = false;
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        // Pull disc toward the stretch direction
        this.pullDiscToward(clientX, clientY);
        
        // Calculate current distance from disc center
        const dx = clientX - this.discX;
        const dy = clientY - this.discY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);
        
        // Calculate angle from disc center to pull point
        const pullAngle = Math.atan2(dy, dx);
        
        // Calculate swing angle: difference between pull direction and original petal angle
        let angleDiff = pullAngle - this.stretchingPetal.angle;
        
        // Normalize angle difference to [-π, π]
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        // Convert to degrees and limit to max swing angle (±20 degrees)
        let swingAngleDeg = (angleDiff * 180) / Math.PI;
        swingAngleDeg = Math.max(-this.stretchingPetal.maxSwingAngle, 
                                 Math.min(this.stretchingPetal.maxSwingAngle, swingAngleDeg));
        
        // Update petal swing angle
        this.stretchingPetal.swingAngle = swingAngleDeg;
        
        // Calculate stretch factor
        const stretchFactor = currentDistance / this.stretchStartDistance;
        let newLength = this.stretchStartLength * stretchFactor;
        
        // If petal is still attached, limit stretch to 25% max and allow shrinking up to 10%
        if (this.stretchingPetal.attached) {
            // Allow shrinking up to 10% (minimum 90% of original length)
            const minLength = this.stretchingPetal.baseLength * 0.9; // 90% of original
            newLength = Math.max(newLength, minLength);
            
            if (newLength > this.stretchingPetal.maxLength) {
                // Detach petal immediately and stop handling
                this.detachPetal(this.stretchingPetal, clientX, clientY);
                this.stopPetalStretch(e);
                return;
            }
            // Limit to max stretch while attached
            newLength = Math.min(newLength, this.stretchingPetal.maxLength);
        }
        
        this.stretchingPetal.currentLength = newLength;
        
        // Update petal position and scale (only if still attached)
        if (this.stretchingPetal.attached) {
            this.updatePetal(this.stretchingPetal);
        }
    }
    
    detachPetal(petal, releaseX, releaseY) {
        if (!petal.attached) return;
        
        // Check BEFORE detaching: is this the last remaining petal?
        const attachedCount = this.petals.filter(p => p.attached).length;
        const isLastPetal = attachedCount === 1;
        
        petal.attached = false;
        
        // Remove from attached petals array
        const index = this.petals.indexOf(petal);
        if (index > -1) {
            this.petals.splice(index, 1);
        }
        
        // Add to detached petals array
        this.detachedPetals.push(petal);
        
        // If this was the last petal, show the answer ONLY if we're on the flower page (question has been sent)
        // Don't show answer on the homepage (questionFlowerContainer)
        const containerId = this.container ? (this.container.id || (this.container.getAttribute && this.container.getAttribute('id'))) : '';
        const isOnFlowerPage = containerId === 'flowerContainer' || 
            (document.getElementById('flowerPage') && document.getElementById('flowerPage').classList.contains('active'));
        if (isLastPetal && !this.answerDisplayed && isOnFlowerPage) {
            // Use finalAnswer (predetermined) - matches traditional "last petal" game
            const answer = this.finalAnswer ?? petal.answer;
            this.showAnswer(answer);
        }
        
        // Change petal class and remove all transitions
        petal.element.classList.remove('flower-petal', 'stretching');
        petal.element.classList.add('detached-petal');
        
        // Get container position for relative positioning
        const containerRect = this.container.getBoundingClientRect();
        const petalRect = petal.element.getBoundingClientRect();
        
        // Calculate position relative to container (not viewport)
        petal.x = petalRect.left - containerRect.left + petalRect.width / 2;
        petal.y = petalRect.top - containerRect.top + petalRect.height / 2;
        
        // Calculate release velocity based on drag direction
        const dx = releaseX - this.discX;
        const dy = releaseY - this.discY;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        
        // Initial velocity based on how far it was stretched
        const stretchRatio = petal.currentLength / petal.baseLength;
        const velocityScale = Math.max(0.5, (stretchRatio - 1) * 2); // Scale velocity based on stretch
        
        petal.velocityX = (dx / distance) * velocityScale * 2;
        petal.velocityY = (dy / distance) * velocityScale * 2;
        petal.velocityRotation = (Math.random() - 0.5) * 10; // Random rotation velocity
        petal.currentRotation = (petal.angle * 180) / Math.PI + 90;
        
        // Remove all event listeners by cloning (cleanest way)
        const newElement = petal.element.cloneNode(true);
        petal.element.parentNode.replaceChild(newElement, petal.element);
        petal.element = newElement;
        
        // Apply all styles to ensure no interactions or transitions
        petal.element.style.pointerEvents = 'none';
        petal.element.style.touchAction = 'none';
        petal.element.style.userSelect = 'none';
        petal.element.style.willChange = 'transform';
        petal.element.style.transition = 'none';
        // Ensure fixed petal size
        petal.element.style.height = '80px';
        petal.element.style.width = 'auto';
        petal.element.style.transform = `translate(-50%, -50%) rotate(${petal.currentRotation}deg)`;
        petal.element.style.left = `${petal.x}px`;
        petal.element.style.top = `${petal.y}px`;
        
        // Remove scaleY transform that was applied during stretching
        petal.element.style.transform = `translate(-50%, -50%) rotate(${petal.currentRotation}deg)`;
        
        // Immediately start disc bounce-back when petal detaches
        this.startDiscSpring();
    }
    
    showAnswer(answer) {
        if (this.answerDisplayed) return; // Prevent showing answer multiple times
        this.answerDisplayed = true;
        
        // Get question: prefer window.currentQuestion, fallback to questionDisplay text
        let question = (typeof window.currentQuestion !== 'undefined' && window.currentQuestion) 
            ? window.currentQuestion 
            : null;
        if (!question) {
            const questionTextEl = document.querySelector('.question-text');
            if (questionTextEl) {
                question = questionTextEl.textContent.replace(/^"|"$/g, '').trim();
            }
        }
        
        // Save flower to database - always attempt if we have question and answer
        if (question && answer) {
            this.saveFlowerToDatabase(question, answer).then(flowerId => {
                if (flowerId) {
                    window.lastCreatedFlowerId = flowerId;
                    console.log('🌸 Flower saved, lastCreatedFlowerId:', flowerId);
                } else {
                    console.error('🌸 Save returned null - flower was NOT saved to database');
                }
            }).catch(err => {
                console.error('🌸 Save failed with error:', err);
            });
        } else {
            console.warn('🌸 Cannot save flower: missing question or answer', { hasQuestion: !!question, hasAnswer: !!answer });
        }
        
        // Hide instructions
        const instructions = document.querySelector('.instructions');
        if (instructions) {
            instructions.style.display = 'none';
        }
        
        // Get the flower page container (parent of this.container)
        const flowerPageContainer = this.container.parentElement;
        
        // Create or get answer display element (image behind flower)
        let answerDisplay = document.getElementById('answerDisplay');
        if (!answerDisplay) {
            answerDisplay = document.createElement('div');
            answerDisplay.id = 'answerDisplay';
            answerDisplay.className = 'answer-display';
            flowerPageContainer.insertBefore(answerDisplay, flowerPageContainer.firstChild);
        }
        
        // Use image for YES/NO - clear and add img
        answerDisplay.innerHTML = '';
        const img = document.createElement('img');
        img.alt = answer;
        img.src = (answer === 'YES') ? 'YES.png' : 'NO.png';
        img.className = 'answer-display-image';
        answerDisplay.appendChild(img);
        answerDisplay.style.display = 'flex';
        answerDisplay.style.opacity = '0';
        
        // Animate answer appearance
        setTimeout(() => {
            answerDisplay.style.transition = 'opacity 0.5s ease-in';
            answerDisplay.style.opacity = '1';
        }, 100);
        
        // Add restart icon in center of flower disc (only on flower page)
        const containerId = this.container ? (this.container.id || '') : '';
        if (containerId === 'flowerContainer' && this.discElement) {
            this.showRestartIcon();
        }
        
        // Create action buttons
        let buttonContainer = document.getElementById('answerButtons');
        if (!buttonContainer) {
            buttonContainer = document.createElement('div');
            buttonContainer.id = 'answerButtons';
            buttonContainer.className = 'answer-buttons';
            
            const doneButton = document.createElement('button');
            doneButton.className = 'answer-button';
            doneButton.textContent = 'Done';
            doneButton.addEventListener('click', async () => {
                console.log('🌸 Done button clicked');
                
                // Get question: prefer window.currentQuestion, fallback to questionDisplay
                let question = (typeof window.currentQuestion !== 'undefined' && window.currentQuestion) 
                    ? window.currentQuestion 
                    : null;
                if (!question) {
                    const questionTextEl = document.querySelector('.question-text');
                    if (questionTextEl) {
                        question = questionTextEl.textContent.replace(/^"|"$/g, '').trim();
                    }
                }
                
                // Save flower to database (if not already saved) - MUST complete before navigating
                let savedFlowerId = this.savedFlowerId;
                if (!savedFlowerId && question && answer) {
                    console.log('🌸 Saving flower to Supabase...');
                    savedFlowerId = await this.saveFlowerToDatabase(question, answer);
                    if (savedFlowerId) {
                        console.log('✅ Flower saved to Supabase with ID:', savedFlowerId);
                    } else {
                        console.error('❌ Save failed - flower was not saved. Will not navigate to Garden.');
                    }
                } else if (savedFlowerId) {
                    console.log('🌸 Flower already saved with ID:', savedFlowerId);
                } else if (!question || !answer) {
                    console.warn('🌸 No question or answer - flower will not appear in Garden');
                }
                
                // Only navigate to Garden if we successfully saved (or had a previous save)
                if (!savedFlowerId) {
                    alert('Could not save your flower. Please try again.');
                    return;
                }
                
                // Store the saved flower ID for Garden page
                window.lastCreatedFlowerId = savedFlowerId;
                console.log('🌸 Set window.lastCreatedFlowerId:', savedFlowerId);
                
                // Brief delay so Supabase read-after-write sees the new flower
                await new Promise(resolve => setTimeout(resolve, 400));
                
                // Navigate to Garden page
                const flowerPage = document.getElementById('flowerPage');
                const gardenPage = document.getElementById('gardenPage');
                
                if (flowerPage && gardenPage) {
                    flowerPage.classList.remove('active');
                    gardenPage.classList.add('active');
                    
                    // Refresh garden and scroll to new flower
                    setTimeout(async () => {
                        // Ensure garden page instance exists and is initialized
                        // Try to get or create the instance
                        if (!window.gardenPageInstance) {
                            // Try using the initialization function if available
                            if (typeof window.initializeGardenPage === 'function') {
                                const instance = window.initializeGardenPage();
                                if (!instance) {
                                    console.error('🌸 initializeGardenPage() returned null - check console for errors');
                                }
                            } else {
                                console.error('🌸 window.initializeGardenPage is not a function');
                                console.error('🌸 Available window properties:', Object.keys(window).filter(k => k.toLowerCase().includes('garden')));
                                
                                // Fallback: try to create directly
                                const gardenPageEl = document.getElementById('gardenPage');
                                let GardenPageClass = null;
                                if (typeof GardenPage !== 'undefined') {
                                    GardenPageClass = GardenPage;
                                } else if (window.GardenPage) {
                                    GardenPageClass = window.GardenPage;
                                }
                                
                                if (gardenPageEl && GardenPageClass) {
                                    try {
                                        window.gardenPageInstance = new GardenPageClass();
                                        console.log('🌸 Created garden page instance via fallback method');
                                    } catch (createError) {
                                        console.error('🌸 Error creating garden page instance:', createError);
                                        console.error('🌸 Error stack:', createError.stack);
                                    }
                                } else {
                                    console.error('🌸 Cannot create instance - gardenPageEl:', !!gardenPageEl, 'GardenPageClass:', !!GardenPageClass);
                                }
                            }
                        }
                        
                        // Wait for instance and initialization
                        let attempts = 0;
                        const maxAttempts = 50; // 5 seconds max
                        while (attempts < maxAttempts) {
                            if (window.gardenPageInstance) {
                                if (window.gardenPageInstance.initialized) {
                                    // Instance is ready
                                    const targetFlowerId = savedFlowerId;
                                    try {
                                        await window.gardenPageInstance.refreshGarden();
                                        if (targetFlowerId) {
                                            setTimeout(() => {
                                                if (window.gardenPageInstance) {
                                                    window.gardenPageInstance.scrollToFlower(targetFlowerId);
                                                }
                                            }, 800);
                                        }
                                    } catch (error) {
                                        console.error('🌸 Error refreshing garden:', error);
                                        console.error('🌸 Error stack:', error.stack);
                                    }
                                    return; // Success, exit
                                }
                            }
                            await new Promise(resolve => setTimeout(resolve, 100));
                            attempts++;
                        }
                        
                        // If we get here, initialization failed
                        if (!window.gardenPageInstance) {
                            console.error('🌸 Garden page instance not available after initialization attempt');
                            console.error('🌸 Debug info:', {
                                gardenPageExists: !!document.getElementById('gardenPage'),
                                gardenContainerExists: !!document.getElementById('gardenContainer'),
                                GardenPageDefined: typeof GardenPage !== 'undefined',
                                windowGardenPage: !!window.GardenPage,
                                initializeGardenPageFunction: typeof window.initializeGardenPage === 'function',
                                documentReadyState: document.readyState,
                                scriptsLoaded: {
                                    database: typeof flowerDB !== 'undefined',
                                    script: typeof FlowerComponent !== 'undefined',
                                    gardenPage: typeof GardenPage !== 'undefined'
                                }
                            });
                        } else if (!window.gardenPageInstance.initialized) {
                            console.error('🌸 Garden page instance exists but initialization timed out');
                            console.error('🌸 Instance state:', {
                                container: !!window.gardenPageInstance.container,
                                canvas: !!window.gardenPageInstance.canvas,
                                initialized: window.gardenPageInstance.initialized,
                                flowersLength: window.gardenPageInstance.flowers ? window.gardenPageInstance.flowers.length : 'N/A'
                            });
                        }
                    }, 100);
                } else {
                    console.error('🌸 Flower page or garden page element not found');
                }
            });
            
            const tryAnotherButton = document.createElement('button');
            tryAnotherButton.className = 'answer-button';
            tryAnotherButton.textContent = 'Try another';
            tryAnotherButton.addEventListener('click', () => {
                // Reload the page to start fresh
                window.location.reload();
            });
            
            buttonContainer.appendChild(doneButton);
            buttonContainer.appendChild(tryAnotherButton);
            flowerPageContainer.appendChild(buttonContainer);
        }
        
        buttonContainer.style.display = 'flex';
        buttonContainer.style.opacity = '0';
        setTimeout(() => {
            buttonContainer.style.transition = 'opacity 0.5s ease-in';
            buttonContainer.style.opacity = '1';
        }, 600);
    }
    
    showRestartIcon() {
        this.hideRestartIcon();
        if (!this.discElement || !this.container) return;
        
        const restartBtn = document.createElement('button');
        restartBtn.className = 'flower-restart-button';
        restartBtn.setAttribute('aria-label', 'Reset petals');
        restartBtn.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
        restartBtn.style.left = `${this.originalDiscX}px`;
        restartBtn.style.top = `${this.originalDiscY}px`;
        restartBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.resetPetals();
        });
        
        this.container.appendChild(restartBtn);
        this.restartButton = restartBtn;
    }
    
    hideRestartIcon() {
        if (this.restartButton && this.restartButton.parentNode) {
            this.restartButton.remove();
            this.restartButton = null;
        }
    }
    
    resetPetals() {
        this.hideRestartIcon();
        const answerDisplay = document.getElementById('answerDisplay');
        if (answerDisplay) answerDisplay.style.display = 'none';
        const buttonContainer = document.getElementById('answerButtons');
        if (buttonContainer) buttonContainer.style.display = 'none';
        const instructions = document.querySelector('.instructions');
        if (instructions) instructions.style.display = 'block';
        
        this.createPetals(true);
    }
    
    /**
     * Save flower to database when answer is shown
     * @returns {Promise<string>} - ID of saved flower
     */
    async saveFlowerToDatabase(question, answer) {
        if (typeof flowerDB === 'undefined') {
            console.error('❌ flowerDB is undefined - database.js may not have loaded');
            return null;
        }
        
        // Check if already saved (prevent duplicate saves)
        if (this.savedFlowerId) {
            console.log('🌸 Flower already saved with ID:', this.savedFlowerId);
            return this.savedFlowerId;
        }
        
        if (!question || !answer) {
            console.error('❌ saveFlowerToDatabase called with missing question or answer');
            return null;
        }
        
        try {
            // Ensure database is initialized
            await flowerDB.init();
            if (!flowerDB.useSupabase && !flowerDB.db) {
                console.warn('⚠️ Database init completed but neither Supabase nor IndexedDB available');
            }
            
            // Generate a unique ID for this flower
            const flowerId = Date.now().toString();
            
            console.log('🌸 Saving flower with ID:', flowerId);
            console.log('🌸 Flower properties:', {
                numPetals: this.numPetals,
                petalRadius: this.petalRadius,
                discSize: this.discSize,
                seed: this.seed
            });
            
            const savedId = await flowerDB.saveFlower({
                id: flowerId, // Explicitly set the ID
                question: question,
                answer: answer,
                numPetals: this.numPetals,
                petalRadius: this.petalRadius,
                discSize: this.discSize,
                seed: this.seed || Math.random(),
                timestamp: Date.now()
            });
            
            this.savedFlowerId = savedId || flowerId;
            console.log('✅ Flower saved successfully! ID:', this.savedFlowerId);
            console.log('✅ Saved ID type:', typeof this.savedFlowerId);
            
            // Verify the flower was saved by trying to retrieve it
            if (savedId) {
                try {
                    const verifyFlower = await flowerDB.getFlower(savedId);
                    if (verifyFlower) {
                        console.log('✅ Verified: Flower exists in database');
                    } else {
                        console.warn('⚠️ Warning: Could not verify flower in database');
                    }
                } catch (verifyError) {
                    console.warn('⚠️ Could not verify flower:', verifyError);
                }
            }
            
            return this.savedFlowerId;
        } catch (error) {
            console.error('❌ Error saving flower:', error);
            console.error('❌ Error stack:', error.stack);
            return null;
        }
    }
    
    updateFallingPetals() {
        this.detachedPetals.forEach(petal => {
            // Double-check petal is detached
            if (petal.attached) return;
            
            // Apply gravity
            petal.velocityY += this.gravity;
            
            // Apply air resistance (damping)
            petal.velocityX *= 0.98;
            petal.velocityY *= 0.98;
            petal.velocityRotation *= 0.98;
            
            // Update position (no collision detection - petals pass through everything)
            petal.x += petal.velocityX;
            petal.y += petal.velocityY;
            
            // Update rotation
            petal.currentRotation = (petal.currentRotation || 0) + petal.velocityRotation;
            
            // Update element position - ensure no transitions interfere
            petal.element.style.transition = 'none';
            petal.element.style.left = `${petal.x}px`;
            petal.element.style.top = `${petal.y}px`;
            petal.element.style.transform = `translate(-50%, -50%) rotate(${petal.currentRotation}deg)`;
            
            // Ensure no interaction can happen
            petal.element.style.pointerEvents = 'none';
            petal.element.style.touchAction = 'none';
            
            // Update container dimensions
            const containerRect = this.container.getBoundingClientRect();
            this.containerHeight = containerRect.height || window.innerHeight;
            
            // Remove if fallen off container
            if (petal.y > this.containerHeight + 100) {
                const index = this.detachedPetals.indexOf(petal);
                if (index > -1) {
                    this.detachedPetals.splice(index, 1);
                    petal.element.remove();
                }
            }
        });
    }
    
    stopPetalStretch = (e) => {
        if (this.stretchingPetal) {
            // If petal was detached during stretch, initialize falling physics
            if (!this.stretchingPetal.attached) {
                // Get current position for falling start
                const rect = this.stretchingPetal.element.getBoundingClientRect();
                this.stretchingPetal.x = rect.left + rect.width / 2;
                this.stretchingPetal.y = rect.top + rect.height / 2;
                
                // Get release position if available
                let clientX = this.discX;
                let clientY = this.discY;
                if (e) {
                    if (e.touches && e.touches.length > 0) {
                        clientX = e.touches[0].clientX;
                        clientY = e.touches[0].clientY;
                    } else if (e.clientX !== undefined) {
                        clientX = e.clientX;
                        clientY = e.clientY;
                    } else if (e.changedTouches && e.changedTouches.length > 0) {
                        clientX = e.changedTouches[0].clientX;
                        clientY = e.changedTouches[0].clientY;
                    }
                }
                
                // Calculate release velocity based on drag direction
                const dx = clientX - this.discX;
                const dy = clientY - this.discY;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                
                const stretchRatio = this.stretchingPetal.currentLength / this.stretchingPetal.baseLength;
                const velocityScale = Math.max(0.5, (stretchRatio - 1) * 2);
                
                this.stretchingPetal.velocityX = (dx / distance) * velocityScale * 2;
                this.stretchingPetal.velocityY = (dy / distance) * velocityScale * 2;
                this.stretchingPetal.velocityRotation = (Math.random() - 0.5) * 10;
                this.stretchingPetal.currentRotation = (this.stretchingPetal.angle * 180) / Math.PI + 90;
            } else {
                // If still attached, remove stretching class
                this.stretchingPetal.element.classList.remove('stretching');
                
                // Reset petal to original form/size when released
                this.stretchingPetal.currentLength = this.stretchingPetal.baseLength;
                this.stretchingPetal.swingAngle = 0;
                
                // Update petal to reflect the reset
                this.updatePetal(this.stretchingPetal);
                
                // Start spring animation to bounce disc back to original position
                this.startDiscSpring();
            }
            this.stretchingPetal = null;
        }
        document.removeEventListener('mousemove', this.handlePetalStretch);
        document.removeEventListener('mouseup', this.stopPetalStretch);
        document.removeEventListener('touchmove', this.handlePetalStretch);
        document.removeEventListener('touchend', (e) => this.stopPetalStretch(e));
    }
    
    updatePetals() {
        // Only update attached petals - filter out any that might have been detached
        this.petals = this.petals.filter(p => p.attached);
        this.petals.forEach(petal => {
            if (petal.attached) {
                this.updatePetal(petal);
            }
        });
    }
    
    updatePetal(petal) {
        // Double-check petal is still attached
        if (!petal || !petal.attached) return;
        
        // Calculate attachment point (tip closer to disc) - this is the anchor point for swinging
        // petalRadius represents distance from disc center to petal center
        // Since transform-origin is 'center bottom', we need to adjust attachment point
        // Petal height is 80px, so center is 40px above bottom
        const discRadius = this.discSize / 2;
        const petalHeight = 80; // Petal height in pixels
        const petalCenterOffset = petalHeight / 2; // Distance from bottom to center
        // Attachment point (bottom) should be at petalRadius - centerOffset to place center at petalRadius
        const attachmentDistance = this.petalRadius - petalCenterOffset;
        const attachmentX = this.discX + Math.cos(petal.angle) * attachmentDistance;
        const attachmentY = this.discY + Math.sin(petal.angle) * attachmentDistance;
        
        // Calculate angle including swing (swing happens around attachment point)
        const currentAngle = petal.angle + (petal.swingAngle * Math.PI / 180);
        
        // Position petal so its bottom (attachment point) is exactly at anchor point
        // Petal extends outward from attachment point
        // Since transform-origin is 'center bottom', we position the element so bottom is at attachment point
        petal.element.style.left = `${attachmentX}px`;
        petal.element.style.top = `${attachmentY}px`;
        
        // Set transform origin to bottom center (attachment point) so rotation happens around it
        petal.element.style.transformOrigin = 'center bottom';
        
        // Rotate petal to point outward from attachment point (including swing angle)
        // The petal should be perpendicular to the direction (pointing outward)
        const baseRotation = (currentAngle * 180) / Math.PI + 90;
        const rotation = baseRotation;
        
        // Translate to center bottom at attachment point, then rotate around it
        // translate(-50%, -100%) positions bottom center of petal at the point
        petal.element.style.transform = `translate(-50%, -100%) rotate(${rotation}deg)`;
        
        // Scale petal length based on stretch (scaleY stretches along the petal's length)
        const lengthScale = petal.currentLength / petal.baseLength;
        
        // Calculate width scale: when length shrinks, width increases proportionally
        // Example: length 100% -> 90% (10% reduction), width 100% -> 110% (10% increase)
        // Formula: widthScale = 2 - lengthScale (only when shrinking)
        // When stretching (lengthScale > 1.0), keep width at 1.0
        const widthScale = lengthScale < 1.0 ? (2 - lengthScale) : 1.0;
        
        petal.element.style.transform += ` scaleY(${lengthScale}) scaleX(${widthScale})`;
    }
    
    setupEventListeners() {
        // Swipe detection for touch devices
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;
        
        // Swipe detection for touch devices
        // Allow swiping even when touching disc/petal (as long as not dragging/stretching)
        this.container.addEventListener('touchstart', (e) => {
            // Only handle if not already handling disc drag or petal stretch
            if (this.isDraggingDisc || this.stretchingPetal) return;
            
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            touchStartTime = Date.now();
            this.swipeCurrentPosition.x = touch.clientX;
            this.swipeCurrentPosition.y = touch.clientY;
            
            // Check if swipe starts within swipe area
            if (this.isInSwipeArea(touch.clientX, touch.clientY)) {
                this.isSwiping = true;
            }
        }, { passive: true });
        
        this.container.addEventListener('touchmove', (e) => {
            // Only handle if not dragging disc or stretching petal
            if (this.isDraggingDisc || this.stretchingPetal) {
                if (this.isSwiping) {
                    // If was swiping, stop detachment and return disc to original
                    this.stopSwipeDetach();
                    this.startDiscSpring();
                    this.isSwiping = false;
                }
                return;
            }
            
            const touch = e.touches[0];
            const currentX = touch.clientX;
            const currentY = touch.clientY;
            
            // Update current swipe position
            this.swipeCurrentPosition.x = currentX;
            this.swipeCurrentPosition.y = currentY;
            
            // Check if finger is still in swipe area
            const inSwipeArea = this.isInSwipeArea(currentX, currentY);
            
            // If swipe is active
            if (this.isSwiping) {
                if (!inSwipeArea) {
                    // Finger moved out of swipe radius - stop detachment and return disc to original
                    this.stopSwipeDetach();
                    this.startDiscSpring();
                    this.isSwiping = false;
                } else {
                    // Make disc follow (this will start continuous detachment if not already started)
                    this.updateDiscFollowSwipe(currentX, currentY);
                }
            } else {
                // Check if finger moved into swipe area
                if (inSwipeArea) {
                    this.isSwiping = true;
                    this.updateDiscFollowSwipe(currentX, currentY);
                }
            }
        }, { passive: true });
        
        this.container.addEventListener('touchend', (e) => {
            if (this.isSwiping) {
                const touch = e.changedTouches[0];
                const endX = touch.clientX;
                const endY = touch.clientY;
                
                // Handle swipe end (this will stop continuous detachment)
                this.handleSwipeEnd(touchStartX, touchStartY, endX, endY);
            }
            
            // Always ensure disc returns to original when touch ends
            if (this.isSwiping) {
                this.stopSwipeDetach(); // Ensure detachment stops
                this.startDiscSpring();
            }
            this.isSwiping = false;
        }, { passive: true });
        
        // Swipe detection for mouse (for desktop testing)
        let mouseStartX = 0;
        let mouseStartY = 0;
        let mouseStartTime = 0;
        let isMouseSwiping = false;
        
        this.container.addEventListener('mousedown', (e) => {
            // Only handle if not already handling disc drag or petal stretch
            if (this.isDraggingDisc || this.stretchingPetal) return;
            
            mouseStartX = e.clientX;
            mouseStartY = e.clientY;
            mouseStartTime = Date.now();
            this.swipeCurrentPosition.x = e.clientX;
            this.swipeCurrentPosition.y = e.clientY;
            
            // Check if swipe starts within swipe area
            if (this.isInSwipeArea(e.clientX, e.clientY)) {
                isMouseSwiping = true;
                this.isSwiping = true;
            }
        });
        
        this.container.addEventListener('mousemove', (e) => {
            // Only handle if not dragging disc or stretching petal
            if (this.isDraggingDisc || this.stretchingPetal) {
                if (isMouseSwiping || this.isSwiping) {
                    // If was swiping, stop detachment and return disc to original
                    this.stopSwipeDetach();
                    this.startDiscSpring();
                }
                isMouseSwiping = false;
                this.isSwiping = false;
                return;
            }
            
            const currentX = e.clientX;
            const currentY = e.clientY;
            
            // Update current swipe position
            this.swipeCurrentPosition.x = currentX;
            this.swipeCurrentPosition.y = currentY;
            
            // Check if mouse is still in swipe area
            const inSwipeArea = this.isInSwipeArea(currentX, currentY);
            
            // If swipe is active
            if (isMouseSwiping && this.isSwiping) {
                if (!inSwipeArea) {
                    // Mouse moved out of swipe radius - stop detachment and return disc to original
                    this.stopSwipeDetach();
                    this.startDiscSpring();
                    isMouseSwiping = false;
                    this.isSwiping = false;
                } else {
                    // Make disc follow (this will start continuous detachment if not already started)
                    this.updateDiscFollowSwipe(currentX, currentY);
                }
            } else {
                // Check if mouse moved into swipe area
                if (inSwipeArea) {
                    isMouseSwiping = true;
                    this.isSwiping = true;
                    this.updateDiscFollowSwipe(currentX, currentY);
                }
            }
        });
        
        this.container.addEventListener('mouseup', (e) => {
            if (isMouseSwiping || this.isSwiping) {
                const endX = e.clientX;
                const endY = e.clientY;
                
                // Handle swipe end (this will stop continuous detachment)
                this.handleSwipeEnd(mouseStartX, mouseStartY, endX, endY);
            }
            
            // Always ensure disc returns to original when mouse is released
            if (isMouseSwiping || this.isSwiping) {
                this.stopSwipeDetach(); // Ensure detachment stops
                this.startDiscSpring();
            }
            isMouseSwiping = false;
            this.isSwiping = false;
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            // Update container dimensions
            const containerRect = this.container.getBoundingClientRect();
            this.containerWidth = containerRect.width || window.innerWidth;
            this.containerHeight = containerRect.height || window.innerHeight;
            
            // Keep disc size fixed (120px) - never changes
            this.discSize = 120;
            this.originalDiscSize = 120;
            
            // Keep petal radius fixed (88px) - maintains ratio with disc
            this.petalRadius = 88;
            
            // Recalculate swipe area radius
            this.swipeAreaRadius = (this.discSize / 2) * 1.5;
            
            // Center everything horizontally based on container
            this.originalDiscX = this.containerWidth / 2;
            this.originalDiscY = this.containerHeight * 0.4;
            
            // Center stem bottom horizontally based on container
            this.stemBottomX = this.containerWidth / 2;
            this.stemBottomY = this.containerHeight;
            
            // Recalculate fixed stem length based on new positions
            const dx = this.originalDiscX - this.stemBottomX;
            const dy = this.originalDiscY - this.stemBottomY;
            this.fixedStemLength = Math.sqrt(dx * dx + dy * dy);
            
            // Recalculate max disc movement
            this.maxDiscMovement = this.fixedStemLength * 0.15;
            
            // Update disc position (center horizontally, maintain relative vertical position)
            if (!this.isDraggingDisc && !this.stretchingPetal && !this.tapAnimationActive) {
                // If not interacting, reset to centered position
                this.discX = this.originalDiscX;
                this.discY = this.originalDiscY;
            } else {
                // If interacting, maintain relative horizontal position but ensure centered
                // Keep current Y position, but center X
                const relativeX = this.discX - (this.containerWidth / 2);
                this.discX = this.containerWidth / 2 + relativeX;
            }
            
            // Update disc visual position and size
            if (this.discElement) {
                this.discElement.style.left = `${this.discX - this.discSize / 2}px`;
                this.discElement.style.top = `${this.discY - this.discSize / 2}px`;
                this.discElement.style.width = `${this.discSize}px`;
                this.discElement.style.height = `${this.discSize}px`;
            }
            
            // Update stem (will recalculate based on new positions)
            this.updateStem();
            
            // Update all petals (they will follow disc position)
            // Ensure all petals maintain fixed size
            this.petals.forEach(petal => {
                if (petal.attached && petal.element) {
                    petal.element.style.height = '80px';
                    petal.element.style.width = 'auto';
                }
            });
            
            // Update detached petals size as well
            this.detachedPetals.forEach(petal => {
                if (petal.element) {
                    petal.element.style.height = '80px';
                    petal.element.style.width = 'auto';
                }
            });
            
            this.updatePetals();
            
            // Update SVG viewBox to match container
            if (this.stemSVG) {
                this.stemSVG.setAttribute('viewBox', `0 0 ${this.containerWidth} ${this.containerHeight}`);
                this.stemSVG.setAttribute('width', this.containerWidth);
                this.stemSVG.setAttribute('height', this.containerHeight);
            }
        });
    }
}

// Initialize the flower component when the page loads
let flowerInstance;

document.addEventListener('DOMContentLoaded', () => {
    // Only initialize flower if flower page is active
    const flowerPage = document.getElementById('flowerPage');
    if (flowerPage && flowerPage.classList.contains('active')) {
        flowerInstance = new FlowerComponent();
    }
});

// Prevent default touch behaviors (only for attached elements)
document.addEventListener('touchmove', (e) => {
    // Only prevent for attached elements, not detached petals
    if (e.target.closest('.flower-disc') || (e.target.closest('.flower-petal') && !e.target.closest('.detached-petal'))) {
        e.preventDefault();
    }
}, { passive: false });
