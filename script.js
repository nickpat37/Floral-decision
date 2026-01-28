class InteractiveDaisy {
    constructor() {
        this.svg = document.getElementById('daisySVG');
        this.centerX = 200;
        this.centerY = 150;
        this.discRadius = 25;
        this.petalLength = 50;
        this.petalWidth = 18;
        this.numPetals = 11;
        this.petals = [];
        this.fallenPetals = 0;
        
        this.init();
    }
    
    init() {
        this.createDaisy();
        this.setupEventListeners();
    }
    
    createDaisy() {
        // Clear existing content
        this.svg.innerHTML = '';
        
        // Create stem first (so it appears behind the flower)
        this.createStem();
        
        // Create disc floret (center) with cross-hatch pattern
        this.createDisc();
        
        // Create ray florets (petals)
        const angleStep = (2 * Math.PI) / this.numPetals;
        
        for (let i = 0; i < this.numPetals; i++) {
            const angle = i * angleStep;
            const petal = this.createPetal(angle, i);
            this.petals.push(petal);
            this.svg.appendChild(petal);
        }
    }
    
    createStem() {
        // Create stem
        const stem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        stem.setAttribute('x1', this.centerX);
        stem.setAttribute('y1', this.centerY + this.discRadius);
        stem.setAttribute('x2', this.centerX);
        stem.setAttribute('y2', 320);
        stem.setAttribute('class', 'stem');
        this.svg.appendChild(stem);
        
        // Create left leaf (larger, rounded)
        const leftLeaf = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const leafLeftX = this.centerX - 15;
        const leafLeftY = 280;
        leftLeaf.setAttribute('d', `M ${leafLeftX} ${leafLeftY} Q ${leafLeftX - 20} ${leafLeftY - 10} ${leafLeftX - 25} ${leafLeftY + 15} Q ${leafLeftX - 15} ${leafLeftY + 20} ${leafLeftX} ${leafLeftY}`);
        leftLeaf.setAttribute('class', 'leaf');
        this.svg.appendChild(leftLeaf);
        
        // Create right leaf (narrower, elongated)
        const rightLeaf = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const leafRightX = this.centerX + 10;
        const leafRightY = 290;
        rightLeaf.setAttribute('d', `M ${leafRightX} ${leafRightY} Q ${leafRightX + 15} ${leafRightY - 5} ${leafRightX + 20} ${leafRightY + 25} Q ${leafRightX + 10} ${leafRightY + 30} ${leafRightX} ${leafRightY}`);
        rightLeaf.setAttribute('class', 'leaf');
        this.svg.appendChild(rightLeaf);
    }
    
    createDisc() {
        // Create disc floret (center circle)
        const disc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        disc.setAttribute('cx', this.centerX);
        disc.setAttribute('cy', this.centerY);
        disc.setAttribute('r', this.discRadius);
        disc.setAttribute('class', 'disc');
        this.svg.appendChild(disc);
        
        // Add cross-hatch pattern
        const hatchGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        hatchGroup.setAttribute('class', 'hatch');
        
        // Horizontal lines
        for (let i = -this.discRadius; i <= this.discRadius; i += 6) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            const y = this.centerY + i;
            const xOffset = Math.sqrt(this.discRadius * this.discRadius - i * i);
            line.setAttribute('x1', this.centerX - xOffset);
            line.setAttribute('y1', y);
            line.setAttribute('x2', this.centerX + xOffset);
            line.setAttribute('y2', y);
            line.setAttribute('stroke', '#ffffff');
            line.setAttribute('stroke-width', '1');
            hatchGroup.appendChild(line);
        }
        
        // Vertical lines
        for (let i = -this.discRadius; i <= this.discRadius; i += 6) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            const x = this.centerX + i;
            const yOffset = Math.sqrt(this.discRadius * this.discRadius - i * i);
            line.setAttribute('x1', x);
            line.setAttribute('y1', this.centerY - yOffset);
            line.setAttribute('x2', x);
            line.setAttribute('y2', this.centerY + yOffset);
            line.setAttribute('stroke', '#ffffff');
            line.setAttribute('stroke-width', '1');
            hatchGroup.appendChild(line);
        }
        
        this.svg.appendChild(hatchGroup);
    }
    
    createPetal(angle, index) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', 'petal');
        group.setAttribute('data-index', index);
        group.setAttribute('data-angle', angle);
        
        // Calculate petal position with slight randomness for hand-drawn look
        const randomOffset = (Math.random() - 0.5) * 0.2; // Slight angle variation
        const adjustedAngle = angle + randomOffset;
        
        const startX = this.centerX + Math.cos(adjustedAngle) * this.discRadius;
        const startY = this.centerY + Math.sin(adjustedAngle) * this.discRadius;
        const endX = this.centerX + Math.cos(adjustedAngle) * (this.discRadius + this.petalLength);
        const endY = this.centerY + Math.sin(adjustedAngle) * (this.discRadius + this.petalLength);
        
        // Create irregular, rounded petal shape using path
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        
        // Add some randomness to make petals look hand-drawn
        const widthVariation = this.petalWidth * (0.8 + Math.random() * 0.4);
        const lengthVariation = this.petalLength * (0.9 + Math.random() * 0.2);
        
        // Create rounded, irregular petal using bezier curves
        const petal = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const cp1x = midX + Math.cos(adjustedAngle + Math.PI / 2) * (widthVariation / 2) * 0.6;
        const cp1y = midY + Math.sin(adjustedAngle + Math.PI / 2) * (widthVariation / 2) * 0.6;
        const cp2x = midX + Math.cos(adjustedAngle - Math.PI / 2) * (widthVariation / 2) * 0.6;
        const cp2y = midY + Math.sin(adjustedAngle - Math.PI / 2) * (widthVariation / 2) * 0.6;
        
        petal.setAttribute('d', `M ${startX} ${startY} 
            Q ${cp1x} ${cp1y} ${endX} ${endY}
            Q ${cp2x} ${cp2y} ${startX} ${startY} Z`);
        petal.setAttribute('class', 'petal');
        
        group.appendChild(petal);
        
        return group;
    }
    
    setupEventListeners() {
        // Support both touch and click events on the entire container
        const container = document.querySelector('.container');
        
        container.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleTap(e.touches[0]);
        }, { passive: false });
        
        container.addEventListener('click', (e) => {
            this.handleTap(e);
        });
    }
    
    handleTap(event) {
        if (this.fallenPetals >= this.numPetals) {
            return; // All petals have fallen
        }
        
        // Find a petal that hasn't fallen yet
        const availablePetals = this.petals.filter(p => !p.classList.contains('fallen'));
        
        if (availablePetals.length === 0) {
            return;
        }
        
        // Randomly select a petal to fall
        const randomIndex = Math.floor(Math.random() * availablePetals.length);
        const petalToFall = availablePetals[randomIndex];
        
        this.makePetalFall(petalToFall);
    }
    
    makePetalFall(petal) {
        if (petal.classList.contains('fallen')) {
            return;
        }
        
        petal.classList.add('fallen');
        this.fallenPetals++;
        
        // Get petal position for transform origin
        const angle = parseFloat(petal.getAttribute('data-angle'));
        const midX = this.centerX + Math.cos(angle) * (this.discRadius + this.petalLength / 2);
        const midY = this.centerY + Math.sin(angle) * (this.discRadius + this.petalLength / 2);
        
        // Set transform origin to petal center
        petal.style.transformOrigin = `${midX}px ${midY}px`;
        
        // Add random rotation and horizontal movement for more natural fall
        const randomRotation = (Math.random() - 0.5) * 720; // Random rotation between -360 and 360
        const randomX = (Math.random() - 0.5) * 200; // Random horizontal drift
        const fallDistance = 600; // Distance to fall
        
        // Get current transform
        const currentTransform = petal.getAttribute('transform') || '';
        const rotationAngle = (angle * 180) / Math.PI;
        
        // Create falling animation
        petal.classList.add('falling');
        
        // Use requestAnimationFrame for smoother animation
        requestAnimationFrame(() => {
            petal.style.transform = `${currentTransform} translate(${randomX}px, ${fallDistance}px) rotate(${randomRotation}deg)`;
            petal.style.opacity = '0';
        });
        
        // Remove petal from DOM after animation
        setTimeout(() => {
            if (petal.parentNode) {
                petal.style.display = 'none';
            }
        }, 2000);
        
        // Check if all petals have fallen
        if (this.fallenPetals >= this.numPetals) {
            setTimeout(() => {
                this.showCompletionMessage();
            }, 500);
        }
    }
    
    showCompletionMessage() {
        const message = document.createElement('div');
        message.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-2deg);
            color: #1a1a5e;
            font-size: 24px;
            text-align: center;
            z-index: 1000;
            animation: fadeIn 0.5s ease-in;
            font-family: 'Kalam', 'Comic Sans MS', 'Marker Felt', cursive, sans-serif;
        `;
        message.textContent = 'All petals have fallen! 🌼';
        document.querySelector('.container').appendChild(message);
        
        // Add fade in animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: translate(-50%, -50%) rotate(-2deg) scale(0.8); }
                to { opacity: 1; transform: translate(-50%, -50%) rotate(-2deg) scale(1); }
            }
        `;
        document.head.appendChild(style);
    }
}

// Initialize the interactive daisy when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new InteractiveDaisy();
});

// Prevent default touch behaviors
document.addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });
