/**
 * Question Page Handler
 * Manages the question modal page and navigation to flower page
 */

let questionFlowerInstance;
let flowerPageInstance;

document.addEventListener('DOMContentLoaded', () => {
    const questionPage = document.getElementById('questionPage');
    const flowerPage = document.getElementById('flowerPage');
    const questionInput = document.getElementById('questionInput');
    const doneButton = document.getElementById('doneButton');
    const questionDisplay = document.getElementById('questionDisplay');
    
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
    
    function navigateToFlowerPage(question) {
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
                
                // Update disc position visually
                if (questionFlowerInstance.discElement) {
                    questionFlowerInstance.discElement.style.left = `${questionFlowerInstance.discX - questionFlowerInstance.discSize / 2}px`;
                    questionFlowerInstance.discElement.style.top = `${questionFlowerInstance.discY - questionFlowerInstance.discSize / 2}px`;
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
                flowerPageInstance = new FlowerComponent({
                    containerId: 'flowerContainer',
                    stemSVGId: 'stemSVG',
                    stemPathId: 'stemPath'
                });
            }
            
            // Show flower page (overlay it on top, both pages visible during transition)
            flowerPage.classList.add('active');
            
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
