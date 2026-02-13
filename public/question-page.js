/**
 * Question Page Handler
 * Manages the question modal page and navigation to flower page
 */

let questionFlowerInstance;
let flowerPageInstance;
let currentQuestion = null; // Store current question for saving

document.addEventListener('DOMContentLoaded', () => {
    const questionPage = document.getElementById('questionPage');
    const flowerPage = document.getElementById('flowerPage');
    const questionInput = document.getElementById('questionInput');
    const doneButton = document.getElementById('doneButton');
    const questionDisplay = document.getElementById('questionDisplay');
    const backToHomeButton = document.getElementById('backToHomeButton');
    const questionModal = document.getElementById('questionModal');
    
    // Shared: go to homepage with a fresh flower reset (used by back from flower page and back from garden)
    window.goToHomepageWithReset = () => {
        const qPage = document.getElementById('questionPage');
        const fPage = document.getElementById('flowerPage');
        const qInput = document.getElementById('questionInput');
        const qDisplay = document.getElementById('questionDisplay');
        const doneBtn = document.getElementById('doneButton');

        fPage.classList.remove('active');
        qPage.classList.add('active');

        // Clear grass when returning home
        const grassLayer = document.getElementById('grassLayer');
        if (grassLayer) grassLayer.innerHTML = '';

        if (questionModal) {
            questionModal.style.transition = 'opacity 0.4s ease-in';
            questionModal.style.opacity = '1';
        }

        // Reset question input and display for fresh start
        if (qInput) {
            qInput.value = '';
            qInput.placeholder = 'Type your question...';
        }
        if (qDisplay) qDisplay.innerHTML = '';
        if (doneBtn) doneBtn.style.display = 'none';

        // Clean up the flower page instance (stop physics, remove elements from flowerContainer)
        if (flowerPageInstance) {
            if (flowerPageInstance.cleanupExistingElements) {
                flowerPageInstance.cleanupExistingElements();
            }
            if (flowerPageInstance.stopPhysicsLoop) {
                flowerPageInstance.stopPhysicsLoop();
            }
            flowerPageInstance = null;
        }

        // Generate a new flower for the question page
        setTimeout(() => {
            questionFlowerInstance = new FlowerComponent({
                containerId: 'questionFlowerContainer',
                stemSVGId: 'questionStemSVG',
                stemPathId: 'questionStemPath'
            });
        }, 100);
    };

    // Back to homepage: flower page -> question page
    if (backToHomeButton) {
        backToHomeButton.addEventListener('click', () => {
            window.goToHomepageWithReset();
        });
    }
    
    // Initialize flower component on question page
    if (questionPage && questionPage.classList.contains('active')) {
        setTimeout(() => {
            questionFlowerInstance = new FlowerComponent({
                containerId: 'questionFlowerContainer',
                stemSVGId: 'questionStemSVG',
                stemPathId: 'questionStemPath'
            });
        }, 100);
    }
    
    // Show Done button when user starts typing
    questionInput.addEventListener('input', () => {
        const hasText = questionInput.value.trim().length > 0;
        if (hasText) {
            doneButton.style.display = 'block';
        } else {
            doneButton.style.display = 'none';
        }
    });
    
    // Handle Done button click
    doneButton.addEventListener('click', () => {
        const question = questionInput.value.trim();
        if (question) {
            // Store question and navigate to flower page
            navigateToFlowerPage(question);
        }
    });
    
    // Also allow Enter key to submit (but allow Shift+Enter for new lines)
    questionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const question = questionInput.value.trim();
            if (question) {
                navigateToFlowerPage(question);
            }
        }
    });
    
    function growGrassFromBottom() {
        const grassLayer = document.getElementById('grassLayer');
        if (!grassLayer) return;
        grassLayer.innerHTML = '';
        
        const sources = [
            { src: '/assets/Grass-1.2.png', cls: 'grass-1' },
            { src: '/assets/Grass-2.2.png', cls: 'grass-2' },
        ];
        // Denser near flower: tight spacing in center, wider toward edges.
        const offsets = [];
        const centerStep = 18;
        const outerStep = 55;
        for (let o = -140; o <= 140; o += centerStep) offsets.push(o);
        for (let o = -320; o < -140; o += outerStep) offsets.push(o);
        for (let o = 150; o <= 330; o += outerStep) offsets.push(o);
        offsets.sort((a, b) => a - b);
        
        const types = assignGrassTypes(offsets.length);
        
        for (let i = 0; i < offsets.length; i++) {
            const idx = types[i];
            const blade = document.createElement('img');
            blade.src = sources[idx].src;
            blade.alt = '';
            blade.className = `grass-blade ${sources[idx].cls}`;
            blade.style.left = `calc(50% + ${offsets[i]}px)`;
            const sizeScale = 0.7 + Math.random() * 0.3;
            blade.style.transform = `translateX(-50%) scale(${sizeScale}) scaleY(0)`;
            blade.style.transitionDelay = `${Math.random() * 0.8}s`;
            blade.dataset.sizeScale = sizeScale;
            grassLayer.appendChild(blade);
        }
        
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                grassLayer.querySelectorAll('.grass-blade').forEach(el => {
                    const s = parseFloat(el.dataset.sizeScale) || 1;
                    el.classList.add('grow');
                    el.style.transform = `translateX(-50%) scale(${s}) scaleY(1)`;
                });
            });
        });
    }
    
    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
    
    function assignGrassTypes(n) {
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
    
    function navigateToFlowerPage(question) {
        // CRITICAL: Store question globally FIRST for saving - must be set before any async/conditional logic
        currentQuestion = question;
        window.currentQuestion = question;
        
        const questionModal = document.getElementById('questionModal');
        const questionFlowerContainer = document.getElementById('questionFlowerContainer');
        const flowerContainer = document.getElementById('flowerContainer');
        
        // Step 1: Fade out the question modal
        questionModal.style.transition = 'opacity 0.4s ease-out';
        questionModal.style.opacity = '0';
        
        // Step 2: After modal fades out, prepare the transition
        setTimeout(() => {
            // Display question on flower page in two-line format (initially hidden)
            questionDisplay.innerHTML = `
                <div class="question-prefix">I want to know if...</div>
                <div class="question-text">"${question}"</div>
            `;
            questionDisplay.style.opacity = '0';
            
            // Step 3: Move flower elements from question page container to interactive page container
            // This keeps the flower in the exact same position
            if (questionFlowerInstance && questionFlowerContainer && flowerContainer) {
                // Move flower elements (disc, petals) to the new container
                // Don't move SVG elements - each container has its own stem SVG
                const flowerElements = Array.from(questionFlowerContainer.children);
                flowerElements.forEach(element => {
                    // Skip SVG elements - flowerContainer already has its own stem SVG
                    if (element.tagName !== 'svg') {
                        flowerContainer.appendChild(element);
                    }
                });
                
                // Update the flower instance to use the new container
                questionFlowerInstance.container = flowerContainer;
                questionFlowerInstance.stemSVG = document.getElementById('stemSVG');
                questionFlowerInstance.stemPath = document.getElementById('stemPath');
                
                // Update container dimensions
                const containerRect = flowerContainer.getBoundingClientRect();
                questionFlowerInstance.containerWidth = containerRect.width || window.innerWidth;
                questionFlowerInstance.containerHeight = containerRect.height || window.innerHeight;
                
                // Recalculate disc and stem positions based on new container dimensions
                questionFlowerInstance.originalDiscX = questionFlowerInstance.containerWidth / 2;
                questionFlowerInstance.originalDiscY = questionFlowerInstance.containerHeight * 0.4;
                questionFlowerInstance.discX = questionFlowerInstance.originalDiscX;
                questionFlowerInstance.discY = questionFlowerInstance.originalDiscY;
                questionFlowerInstance.stemBottomX = questionFlowerInstance.containerWidth / 2;
                questionFlowerInstance.stemBottomY = questionFlowerInstance.containerHeight;
                
                // Recalculate fixed stem length
                const dx = questionFlowerInstance.originalDiscX - questionFlowerInstance.stemBottomX;
                const dy = questionFlowerInstance.originalDiscY - questionFlowerInstance.stemBottomY;
                questionFlowerInstance.fixedStemLength = Math.sqrt(dx * dx + dy * dy);
                questionFlowerInstance.maxDiscMovement = questionFlowerInstance.fixedStemLength * 0.15;
                
                // Update stem SVG
                if (questionFlowerInstance.stemSVG) {
                    questionFlowerInstance.stemSVG.setAttribute('viewBox', `0 0 ${questionFlowerInstance.containerWidth} ${questionFlowerInstance.containerHeight}`);
                    questionFlowerInstance.stemSVG.setAttribute('width', questionFlowerInstance.containerWidth);
                    questionFlowerInstance.stemSVG.setAttribute('height', questionFlowerInstance.containerHeight);
                }
                
                // Update disc position visually (uses discWrapper when present)
                if (questionFlowerInstance.discElement) {
                    questionFlowerInstance.updateDiscPosition();
                }
                
                // Update stem path to ensure it's drawn (critical after transition)
                if (questionFlowerInstance.stemPath) {
                    questionFlowerInstance.updateStem();
                }
                
                // Update petals to reflect new disc position
                questionFlowerInstance.updatePetals();
                
                // Regrow any missing petals (if user detached some before sending question)
                setTimeout(() => {
                    questionFlowerInstance.regrowMissingPetals();
                }, 100); // Small delay to ensure transition is complete
                
                // Reuse the same instance
                flowerPageInstance = questionFlowerInstance;
            } else if (!flowerPageInstance) {
                // Fallback: create new instance if moving failed
                // window.currentQuestion already set at start of navigateToFlowerPage
                flowerPageInstance = new FlowerComponent({
                    containerId: 'flowerContainer',
                    stemSVGId: 'stemSVG',
                    stemPathId: 'stemPath'
                });
            }
            
            // Show flower page (overlay it on top, both pages visible during transition)
            flowerPage.classList.add('active');
            
            // Grow grass from bottom (Grass_1, Grass_2 ~30% larger than Grass_3)
            growGrassFromBottom();
            
            // Step 4: After a brief delay, hide question page and fade in question display
            setTimeout(() => {
                questionPage.classList.remove('active');
                
                // Fade in the question display
                questionDisplay.style.transition = 'opacity 0.4s ease-in';
                questionDisplay.style.opacity = '1';
            }, 50);
        }, 400); // Wait for fade-out to complete
    }
});
