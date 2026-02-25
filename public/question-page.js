/**
 * Question Page Handler
 * Manages the question modal page and navigation to flower page
 */

const QUESTION_TEXT_FONT_SIZE = 20;
const QUESTION_TEXT_LINE_HEIGHT = 1.35;
const PETAL_RADIUS = 88;
const PETAL_HEIGHT = 80;

/**
 * Truncate text using line-based calculation.
 * maxAllowedHeight = (lineHeight + lineSpacing) × maxLines.
 * If content height would equal or exceed container: remove the overflowing line,
 * truncate the line above with "..." at the last word.
 */
function truncateToLastWord(text, containerHeightPx, measureElement) {
    const t = (text || '').replace(/^"|"$/g, '').trim();
    if (!t) return { display: '""', truncated: false };
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length === 0 || !measureElement) return { display: `"${t}"`, truncated: false };
    const lineHeightPx = QUESTION_TEXT_FONT_SIZE * QUESTION_TEXT_LINE_HEIGHT;
    const lineSpacing = 0;
    const heightPerLine = lineHeightPx + lineSpacing;
    const maxLines = Math.max(1, Math.floor(containerHeightPx / heightPerLine));
    const maxAllowedHeight = maxLines * heightPerLine;
    let visible = '';
    for (let i = 0; i < words.length; i++) {
        const candidate = visible ? visible + ' ' + words[i] : words[i];
        measureElement.textContent = `"${candidate}"`;
        if (measureElement.offsetHeight >= maxAllowedHeight) break;
        visible = candidate;
    }
    const truncated = visible.length < t.length;
    return { display: `"${visible}${truncated ? '...' : ''}"`, truncated };
}

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

        // Clear global state to prevent stale answer/question from previous session
        window.currentQuestion = null;
        window.lastCreatedFlowerId = null;
        currentQuestion = null;

        // Hide and clear answer display (prevents old YES/NO from showing on next flower)
        const answerDisplay = document.getElementById('answerDisplay');
        if (answerDisplay) {
            answerDisplay.innerHTML = '';
            answerDisplay.style.display = 'none';
            answerDisplay.style.opacity = '0';
        }
        const answerButtons = document.getElementById('answerButtons');
        if (answerButtons) {
            answerButtons.style.display = 'none';
        }
        const signInBelowDisc = document.getElementById('signInBelowDisc');
        if (signInBelowDisc) {
            signInBelowDisc.style.display = 'none';
        }
        const instructions = document.querySelector('.instructions');
        if (instructions) instructions.style.display = 'block';

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

        // Clear flowerContainer of any leftover disc/petals (in case instance was null or cleanup missed anything)
        const flowerContainer = document.getElementById('flowerContainer');
        if (flowerContainer) {
            flowerContainer.querySelectorAll('.flower-disc, .flower-disc-wrapper, .flower-petal, .detached-petal').forEach(el => el.remove());
        }

        // Generate a new flower for the question page (layout uses viewport fallback when needed)
        const createFlower = () => {
            const container = document.getElementById('questionFlowerContainer');
            if (container && document.getElementById('questionStemSVG') && document.getElementById('questionStemPath')) {
                questionFlowerInstance = new FlowerComponent({
                    containerId: 'questionFlowerContainer',
                    stemSVGId: 'questionStemSVG',
                    stemPathId: 'questionStemPath'
                });
            } else {
                setTimeout(createFlower, 50);
            }
        };
        setTimeout(createFlower, 50);
    };

    // Back to homepage: flower page -> question page
    if (backToHomeButton) {
        backToHomeButton.addEventListener('click', () => {
            window.goToHomepageWithReset();
        });
    }
    
    // Initialize flower component on question page
    // Delay ensures layout is complete (particles, fonts, viewport) before creating flower
    if (questionPage && questionPage.classList.contains('active')) {
        const initHomepageFlower = () => {
            const container = document.getElementById('questionFlowerContainer');
            const stemSvg = document.getElementById('questionStemSVG');
            const stemPath = document.getElementById('questionStemPath');
            if (!container || !stemSvg || !stemPath) {
                setTimeout(initHomepageFlower, 50);
                return;
            }
            questionFlowerInstance = new FlowerComponent({
                containerId: 'questionFlowerContainer',
                stemSVGId: 'questionStemSVG',
                stemPathId: 'questionStemPath'
            });
        };
        // Use setTimeout to ensure layout/paint complete after DOMContentLoaded
        setTimeout(initHomepageFlower, 50);
    }
    
    // Show Done button when user starts typing (multi-event for Safari compatibility)
    const updateDoneButtonVisibility = () => {
        requestAnimationFrame(() => {
            const hasText = questionInput.value.trim().length > 0;
            doneButton.style.display = hasText ? 'flex' : 'none';
        });
    };
    questionInput.addEventListener('input', updateDoneButtonVisibility);
    questionInput.addEventListener('keyup', updateDoneButtonVisibility);
    questionInput.addEventListener('paste', updateDoneButtonVisibility);
    
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
        const asset = (p) => new URL(p, window.location.href).href;
        const sources = [
            { src: asset('assets/Grass-1.2.png'), cls: 'grass-1' },
            { src: asset('assets/Grass-2.2.png'), cls: 'grass-2' },
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
            // Height variety: scale from 0.45 to 1.35 (was 0.7–1.0) for more varied blade heights
            const sizeScale = 0.45 + Math.random() * 0.9;
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
            
            // Step 3: Move flower elements to interactive page container
            if (questionFlowerInstance && questionFlowerContainer && flowerContainer) {
                const flowerElements = Array.from(questionFlowerContainer.children);
                flowerElements.forEach(element => {
                    if (element.tagName !== 'svg') flowerContainer.appendChild(element);
                });
                questionFlowerInstance.container = flowerContainer;
                questionFlowerInstance.stemSVG = document.getElementById('stemSVG');
                questionFlowerInstance.stemPath = document.getElementById('stemPath');
                flowerPageInstance = questionFlowerInstance;
            } else if (!flowerPageInstance) {
                flowerPageInstance = new FlowerComponent({
                    containerId: 'flowerContainer',
                    stemSVGId: 'stemSVG',
                    stemPathId: 'stemPath'
                });
            }
            
            // Show flower page FIRST so getBoundingClientRect returns correct dimensions
            flowerPage.classList.add('active');
            
            // Step 4: Layout adjustment (double rAF ensures layout is complete)
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const instance = flowerPageInstance;
                    if (!instance || !flowerContainer) return;
                    const containerRect = flowerContainer.getBoundingClientRect();
                    instance.containerWidth = containerRect.width || window.innerWidth;
                    instance.containerHeight = containerRect.height || window.innerHeight;
                    const containerH = instance.containerHeight;
                    const questionTop = 59;
                    const gap = 16;
                    const petalRadius = instance.petalRadius ?? PETAL_RADIUS;
                    const petalHeight = PETAL_HEIGHT;
                    const flowerTopExtension = petalRadius + petalHeight / 2;
                    const discYAt40 = containerH * 0.4;
                    const discYAt50 = containerH * 0.5;
                    const flowerTopAt40 = discYAt40 - flowerTopExtension;
                    const flowerTopAt50 = discYAt50 - flowerTopExtension;
                    const maxQuestionHeightAt40 = Math.max(0, flowerTopAt40 - questionTop - gap);
                    const maxQuestionHeightAt50 = Math.max(0, flowerTopAt50 - questionTop - gap);
                    questionDisplay.style.maxHeight = '';
                    const questionNaturalHeight = questionDisplay.scrollHeight;
                    const useLowerPosition = questionNaturalHeight > maxQuestionHeightAt40;
                    const flowerYFactor = useLowerPosition ? 0.5 : 0.4;
                    const maxQuestionHeight = useLowerPosition ? maxQuestionHeightAt50 : maxQuestionHeightAt40;
                    instance.originalDiscX = instance.containerWidth / 2;
                    instance.originalDiscY = containerH * flowerYFactor;
                    instance.discX = instance.originalDiscX;
                    instance.discY = instance.originalDiscY;
                    instance.discYFactor = flowerYFactor;
                    instance.stemBottomX = instance.containerWidth / 2;
                    instance.stemBottomY = instance.containerHeight;
                    questionDisplay.style.maxHeight = maxQuestionHeight + 'px';
                    questionDisplay.style.overflow = 'hidden';
                    const questionText = questionDisplay.querySelector('.question-text');
                    const questionPrefix = questionDisplay.querySelector('.question-prefix');
                    if (questionText) {
                        questionText.style.webkitLineClamp = 'unset';
                        questionText.style.lineClamp = 'unset';
                        questionText.style.display = 'block';
                        questionText.style.overflow = 'visible';
                        const fullQuestion = questionText.textContent.replace(/^"|"$/g, '').trim();
                        const prefixHeight = questionPrefix ? questionPrefix.offsetHeight : 22;
                        const textContainerHeight = Math.max(27, questionDisplay.clientHeight - prefixHeight);
                        const { display } = truncateToLastWord(fullQuestion, textContainerHeight, questionText);
                        questionText.textContent = display;
                        questionText.style.overflow = 'hidden';
                    }
                    const dx = instance.originalDiscX - instance.stemBottomX;
                    const dy = instance.originalDiscY - instance.stemBottomY;
                    instance.fixedStemLength = Math.sqrt(dx * dx + dy * dy);
                    instance.maxDiscMovement = instance.fixedStemLength * 0.15;
                    if (instance.stemSVG) {
                        instance.stemSVG.setAttribute('viewBox', `0 0 ${instance.containerWidth} ${instance.containerHeight}`);
                        instance.stemSVG.setAttribute('width', instance.containerWidth);
                        instance.stemSVG.setAttribute('height', instance.containerHeight);
                    }
                    if (useLowerPosition && flowerContainer) {
                        flowerContainer.classList.add('flower-shift-transition');
                        setTimeout(() => {
                            flowerContainer.classList.remove('flower-shift-transition');
                        }, 450);
                    }
                    if (instance.discElement) instance.updateDiscPosition();
                    if (instance.stemPath) instance.updateStem();
                    instance.updatePetals();
                    if (questionFlowerInstance) setTimeout(() => instance.regrowMissingPetals && instance.regrowMissingPetals(), 100);
                });
            });
            
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
