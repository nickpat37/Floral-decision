class FlowerComponent {
    constructor() {
        this.container = document.getElementById('flowerContainer');
        this.stemSVG = document.getElementById('stemSVG');
        this.stemPath = document.getElementById('stemPath');
        
        // Initial positions
        this.originalDiscX = window.innerWidth / 2;
        this.originalDiscY = window.innerHeight * 0.3;
        this.discX = this.originalDiscX;
        this.discY = this.originalDiscY;
        this.stemBottomX = window.innerWidth / 2;
        this.stemBottomY = window.innerHeight * 0.9;
        
        // Disc properties
        this.discSize = 120;
        this.discElement = null;
        this.isDraggingDisc = false;
        this.dragOffset = { x: 0, y: 0 };
        
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
        this.numPetals = 13; // 12-14 petals as in reference image
        this.petalRadius = 70; // Distance from disc center to petal center
        this.petals = [];
        this.detachedPetals = []; // Petals that have fallen off
        this.stretchingPetal = null;
        this.stretchStartDistance = 0;
        this.stretchStartLength = 0;
        this.maxStretchFactor = 1.25; // 25% max stretch before detachment
        
        // Physics properties
        this.gravity = 0.4; // 20% lighter (reduced from 0.5)
        this.animationFrameId = null;
        
        this.init();
    }
    
    init() {
        // Calculate fixed stem length based on original positions
        const dx = this.originalDiscX - this.stemBottomX;
        const dy = this.originalDiscY - this.stemBottomY;
        this.fixedStemLength = Math.sqrt(dx * dx + dy * dy);
        
        // Maximum disc movement from original position (due to stem hardness)
        this.maxDiscMovement = this.fixedStemLength * 0.15; // 15% of stem length max movement
        
        this.createStem();
        this.createDisc();
        this.createPetals();
        this.setupEventListeners();
        this.updateStem();
        this.startPhysicsLoop();
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
            this.animationFrameId = requestAnimationFrame(animate);
        };
        animate();
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
            
            // Update visual position
            this.discElement.style.left = `${this.discX - this.discSize / 2}px`;
            this.discElement.style.top = `${this.discY - this.discSize / 2}px`;
            
            // Update stem
            this.updateStem();
            
            // Update petals
            this.updatePetals();
        } else {
            // Snap to original position when close enough
            this.discX = this.originalDiscX;
            this.discY = this.originalDiscY;
            this.discSpringActive = false;
            
            // Final update
            this.discElement.style.left = `${this.discX - this.discSize / 2}px`;
            this.discElement.style.top = `${this.discY - this.discSize / 2}px`;
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
        
        // Update visual position
        this.discElement.style.left = `${this.discX - this.discSize / 2}px`;
        this.discElement.style.top = `${this.discY - this.discSize / 2}px`;
        
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
        const disc = document.createElement('img');
        disc.src = 'Disc.png';
        disc.className = 'flower-disc';
        disc.id = 'flowerDisc';
        
        disc.style.left = `${this.discX - this.discSize / 2}px`;
        disc.style.top = `${this.discY - this.discSize / 2}px`;
        
        this.discElement = disc;
        this.container.appendChild(disc);
        
        // Disc drag handlers
        disc.addEventListener('mousedown', (e) => this.startDiscDrag(e));
        disc.addEventListener('touchstart', (e) => this.startDiscDrag(e), { passive: false });
    }
    
    startDiscDrag(e) {
        e.preventDefault();
        this.isDraggingDisc = true;
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
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
        
        // Stop spring animation while dragging
        this.discSpringActive = false;
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        // Update disc position
        this.discX = clientX - this.dragOffset.x;
        this.discY = clientY - this.dragOffset.y;
        
        // Constrain to screen bounds
        const maxX = window.innerWidth - this.discSize / 2;
        const minX = this.discSize / 2;
        const maxY = window.innerHeight - this.discSize / 2;
        const minY = this.discSize / 2;
        
        this.discX = Math.max(minX, Math.min(maxX, this.discX));
        this.discY = Math.max(minY, Math.min(maxY, this.discY));
        
        // Constrain disc position due to stem hardness
        this.constrainDiscPosition();
        
        // Update disc visual position
        this.discElement.style.left = `${this.discX - this.discSize / 2}px`;
        this.discElement.style.top = `${this.discY - this.discSize / 2}px`;
        
        // Update stem
        this.updateStem();
        
        // Update petals
        this.updatePetals();
    }
    
    stopDiscDrag = () => {
        this.isDraggingDisc = false;
        
        // Start spring animation to bounce back to original position
        this.startDiscSpring();
        
        document.removeEventListener('mousemove', this.handleDiscDrag);
        document.removeEventListener('mouseup', this.stopDiscDrag);
        document.removeEventListener('touchmove', this.handleDiscDrag);
        document.removeEventListener('touchend', this.stopDiscDrag);
    }
    
    createPetals() {
        // Clear existing petals
        this.petals.forEach(petal => petal.element.remove());
        this.petals = [];
        
        const angleStep = (2 * Math.PI) / this.numPetals;
        
        for (let i = 0; i < this.numPetals; i++) {
            const angle = i * angleStep;
            const petal = this.createPetal(angle, i);
            this.petals.push(petal);
        }
        
        this.updatePetals();
    }
    
    createPetal(angle, index) {
        const petalElement = document.createElement('img');
        petalElement.src = 'Petal.png';
        petalElement.className = 'flower-petal';
        petalElement.setAttribute('data-index', index);
        petalElement.setAttribute('data-angle', angle);
        
        this.container.appendChild(petalElement);
        
        // Base length should be the petal radius (distance from disc edge)
        const discRadius = this.discSize / 2;
        const baseLength = this.petalRadius;
        
        const petal = {
            element: petalElement,
            angle: angle,
            index: index,
            baseLength: baseLength,
            currentLength: baseLength,
            baseRotation: (angle * 180) / Math.PI,
            attached: true, // Whether petal is still attached to disc
            maxLength: baseLength * this.maxStretchFactor // Max length before detachment
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
        
        petal.attached = false;
        
        // Remove from attached petals array immediately
        const index = this.petals.indexOf(petal);
        if (index > -1) {
            this.petals.splice(index, 1);
        }
        
        // Add to detached petals array
        this.detachedPetals.push(petal);
        
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
        petal.element.style.transform = `translate(-50%, -50%) rotate(${petal.currentRotation}deg)`;
        petal.element.style.left = `${petal.x}px`;
        petal.element.style.top = `${petal.y}px`;
        
        // Remove scaleY transform that was applied during stretching
        petal.element.style.transform = `translate(-50%, -50%) rotate(${petal.currentRotation}deg)`;
        
        // Immediately start disc bounce-back when petal detaches
        this.startDiscSpring();
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
            
            // Remove if fallen off screen
            if (petal.y > window.innerHeight + 100) {
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
        
        // Calculate petal position - petals should be at the edge of the disc, radiating outward
        // The petal's base (where it connects to disc) should be at disc edge
        const discRadius = this.discSize / 2;
        
        // Petal extends from disc edge outward
        // Position petal so its base is at disc edge and it extends outward
        const petalBaseDistance = discRadius; // Where petal connects to disc
        const petalCenterDistance = petalBaseDistance + (petal.currentLength / 2);
        
        // Position petal center along the radial line from disc center
        const petalX = this.discX + Math.cos(petal.angle) * petalCenterDistance;
        const petalY = this.discY + Math.sin(petal.angle) * petalCenterDistance;
        
        // Position petal element (center of petal image)
        petal.element.style.left = `${petalX}px`;
        petal.element.style.top = `${petalY}px`;
        
        // Rotate petal to point outward from disc
        // The petal should be perpendicular to the radius line (pointing outward)
        const rotation = (petal.angle * 180) / Math.PI + 90;
        petal.element.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
        
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
        // Handle window resize
        window.addEventListener('resize', () => {
            // Update original position on resize
            this.originalDiscX = window.innerWidth / 2;
            this.originalDiscY = window.innerHeight * 0.3;
            
            // If not dragging, reset to original position
            if (!this.isDraggingDisc && !this.stretchingPetal) {
                this.discX = this.originalDiscX;
                this.discY = this.originalDiscY;
                this.discElement.style.left = `${this.discX - this.discSize / 2}px`;
                this.discElement.style.top = `${this.discY - this.discSize / 2}px`;
            }
            
            this.stemBottomX = window.innerWidth / 2;
            this.stemBottomY = window.innerHeight * 0.9;
            this.updateStem();
        });
    }
}

// Initialize the flower component when the page loads
let flowerInstance;

document.addEventListener('DOMContentLoaded', () => {
    flowerInstance = new FlowerComponent();
});

// Prevent default touch behaviors (only for attached elements)
document.addEventListener('touchmove', (e) => {
    // Only prevent for attached elements, not detached petals
    if (e.target.closest('.flower-disc') || (e.target.closest('.flower-petal') && !e.target.closest('.detached-petal'))) {
        e.preventDefault();
    }
}, { passive: false });
