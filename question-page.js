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
        // Hide question page
        questionPage.classList.remove('active');
        
        // Stop question page flower physics if running
        if (questionFlowerInstance) {
            questionFlowerInstance.stopPhysicsLoop();
        }
        
        // Display question on flower page
        questionDisplay.textContent = question;
        
        // Show flower page
        flowerPage.classList.add('active');
        
        // Initialize flower component on flower page if not already initialized
        if (!flowerPageInstance) {
            // Wait a bit for page transition
            setTimeout(() => {
                flowerPageInstance = new FlowerComponent({
                    containerId: 'flowerContainer',
                    stemSVGId: 'stemSVG',
                    stemPathId: 'stemPath'
                });
            }, 100);
        }
    }
});
