class FlowerComponent {
    constructor() {
        this.container = document.getElementById('flowerContainer');
        this.stemSVG = document.getElementById('stemSVG');
        this.stemPath = document.getElementById('stemPath');
        
        // Initial positions
        this.discX = window.innerWidth / 2;
        this.discY = window.innerHeight * 0.3;
        this.stemBottomX = window.innerWidth / 2;
        this.stemBottomY = window.innerHeight * 0.9;
        
        // Disc properties
        this.discSize = 120;
        this.discElement = null;
        this.isDraggingDisc = false;
        this.dragOffset = { x: 0, y: 0 };
        
        // Petal properties
        this.numPetals = 13; // 12-14 petals as in reference image
        this.petalRadius = 70; // Distance from disc center to petal center
        this.petals = [];
        this.detachedPetals = []; // Petals that have fallen off
        this.stretchingPetal = null;
        this.stretchStartDistance = 0;
        this.stretchStartLength = 0;
        this.maxStretchFactor = 1.15; // 15% max stretch before detachment
        
        // Physics properties
        this.gravity = 0.5;
        this.animationFrameId = null;
        
        this.init();
    }
    
    init() {
        this.createStem();
        this.createDisc();
        this.createPetals();
        this.setupEventListeners();
        this.updateStem();
        this.startPhysicsLoop();
    }
    
    startPhysicsLoop() {
        const animate = () => {
            this.updateFallingPetals();
            this.animationFrameId = requestAnimationFrame(animate);
        };
        animate();
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
    
    updateStem() {
        // Create flexible curved path from bottom to disc
        const startX = this.stemBottomX;
        const startY = this.stemBottomY;
        const endX = this.discX;
        const endY = this.discY;
        
        // Calculate control points for smooth curve
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        
        // Add some curvature based on horizontal distance
        const horizontalDistance = Math.abs(endX - startX);
        const curvature = Math.min(horizontalDistance * 0.3, 100);
        
        const cp1X = midX + (endX > startX ? -curvature : curvature);
        const cp1Y = midY;
        const cp2X = midX + (endX > startX ? curvature : -curvature);
        const cp2Y = midY;
        
        // Create smooth bezier curve path
        const pathData = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
        this.stemPath.setAttribute('d', pathData);
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
        e.preventDefault();
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        // Calculate current distance from disc center
        const dx = clientX - this.discX;
        const dy = clientY - this.discY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);
        
        // Calculate stretch factor
        const stretchFactor = currentDistance / this.stretchStartDistance;
        let newLength = this.stretchStartLength * stretchFactor;
        
        // If petal is still attached, limit stretch to 15% max
        if (this.stretchingPetal.attached) {
            if (newLength > this.stretchingPetal.maxLength) {
                // Detach petal
                this.detachPetal(this.stretchingPetal, clientX, clientY);
                return;
            }
            // Limit to max stretch while attached
            newLength = Math.min(newLength, this.stretchingPetal.maxLength);
        }
        
        this.stretchingPetal.currentLength = newLength;
        
        // Update petal position and scale
        this.updatePetal(this.stretchingPetal);
    }
    
    detachPetal(petal, releaseX, releaseY) {
        if (!petal.attached) return;
        
        petal.attached = false;
        
        // Remove from attached petals array
        const index = this.petals.indexOf(petal);
        if (index > -1) {
            this.petals.splice(index, 1);
        }
        
        // Add to detached petals array
        this.detachedPetals.push(petal);
        
        // Change petal class
        petal.element.classList.remove('flower-petal', 'stretching');
        petal.element.classList.add('detached-petal');
        
        // Get current position
        const rect = petal.element.getBoundingClientRect();
        petal.x = rect.left + rect.width / 2;
        petal.y = rect.top + rect.height / 2;
        
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
        
        // Make element non-interactive
        petal.element.style.pointerEvents = 'none';
    }
    
    updateFallingPetals() {
        this.detachedPetals.forEach(petal => {
            // Apply gravity
            petal.velocityY += this.gravity;
            
            // Apply air resistance (damping)
            petal.velocityX *= 0.98;
            petal.velocityY *= 0.98;
            petal.velocityRotation *= 0.98;
            
            // Update position
            petal.x += petal.velocityX;
            petal.y += petal.velocityY;
            
            // Update rotation
            petal.currentRotation = (petal.currentRotation || 0) + petal.velocityRotation;
            
            // Update element position
            petal.element.style.left = `${petal.x}px`;
            petal.element.style.top = `${petal.y}px`;
            petal.element.style.transform = `translate(-50%, -50%) rotate(${petal.currentRotation}deg)`;
            
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
            }
            this.stretchingPetal = null;
        }
        document.removeEventListener('mousemove', this.handlePetalStretch);
        document.removeEventListener('mouseup', this.stopPetalStretch);
        document.removeEventListener('touchmove', this.handlePetalStretch);
        document.removeEventListener('touchend', (e) => this.stopPetalStretch(e));
    }
    
    updatePetals() {
        // Only update attached petals
        this.petals.filter(p => p.attached).forEach(petal => this.updatePetal(petal));
    }
    
    updatePetal(petal) {
        if (!petal.attached) return;
        
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
        const scale = petal.currentLength / petal.baseLength;
        petal.element.style.transform += ` scaleY(${scale})`;
    }
    
    setupEventListeners() {
        // Handle window resize
        window.addEventListener('resize', () => {
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

// Prevent default touch behaviors
document.addEventListener('touchmove', (e) => {
    if (e.target.closest('.flower-disc') || e.target.closest('.flower-petal')) {
        e.preventDefault();
    }
}, { passive: false });
