// humanizer.js
// This library will contain functions to simulate human-like interactions.

console.log("Humanizer library loaded.");

/**
 * Generates a random number following a standard normal distribution (Box-Muller transform).
 * @returns {number} A random number from a normal distribution.
 */
function randomGaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random(); //Converting [0,1) to (0,1)
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Creates a delay that feels more human-like by using a normal distribution.
 * @param {number} base - The baseline delay in milliseconds.
 * @param {number} deviation - The standard deviation from the baseline in ms.
 * @returns {Promise<void>} A promise that resolves after the calculated delay.
 */
function realisticDelay(base, deviation) {
    const randomFactor = randomGaussian(); // Value typically between -3 and 3
    const calculatedDeviation = randomFactor * deviation;
    
    // Clamp the delay to be non-negative and not excessively long
    const delayTime = Math.max(0, Math.min(base + calculatedDeviation, base + 3 * deviation));
    
    // console.log(`realisticDelay: base=${base}, dev=${deviation}, calculated=${delayTime.toFixed(2)}`);
    
    return new Promise(res => setTimeout(res, delayTime));
}

/**
 * A very short delay to simulate time between keystrokes.
 * @returns {Promise<void>}
 */
async function typingDelay() {
    await realisticDelay(100, 40); // Avg 100ms, deviates by ~40ms
}

/**
 * A short delay to simulate a user thinking or reading before an action.
 * @returns {Promise<void>}
 */
async function thinkingDelay() {
    await realisticDelay(1200, 400); // Avg 1.2s, deviates by ~0.4s
}

/**
 * A longer delay to simulate waiting for a server response or page load.
 * @returns {Promise<void>}
 */
async function actionDelay() {
    await realisticDelay(2500, 800); // Avg 2.5s, deviates by ~0.8s
}

// --- Mouse Simulation Functions ---

/**
 * Easing function for natural mouse movement (accelerates and decelerates).
 * @param {number} t - Progress of the animation (0 to 1).
 * @returns {number} The eased progress.
 */
function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Simulates a human-like mouse movement to an element and then clicks it.
 * @param {HTMLElement} element - The target element to move to and click.
 * @param {object} [options] - Optional parameters.
 * @param {number} [options.duration=1000] - The base duration of the movement in ms.
 * @param {number} [options.deviation=300] - The deviation for the movement duration.
 */
async function humanizedMoveAndClick(element) {
    const startX = window.scrollX + window.innerWidth / 2; // Assume mouse starts at center
    const startY = window.scrollY + window.innerHeight / 2;

    const rect = element.getBoundingClientRect();
    // Add small random offset to the target point to avoid always clicking the exact center
    const targetX = rect.left + rect.width / 2 + (Math.random() - 0.5) * rect.width * 0.4;
    const targetY = rect.top + rect.height / 2 + (Math.random() - 0.5) * rect.height * 0.4;

    const duration = 800 + Math.random() * 500; // Randomize duration
    const startTime = performance.now();

    // Create a fake mouse pointer for visual debugging (can be removed later)
    const pointer = document.createElement('div');
    pointer.style.position = 'fixed';
    pointer.style.width = '10px';
    pointer.style.height = '10px';
    pointer.style.background = 'red';
    pointer.style.borderRadius = '50%';
    pointer.style.zIndex = '99999';
    document.body.appendChild(pointer);

    // Calculate Bezier curve control points for a more natural path
    const cp1x = startX + (targetX - startX) * 0.2 + (Math.random() - 0.5) * 100;
    const cp1y = startY + (targetY - startY) * 0.8 + (Math.random() - 0.5) * 100;
    const cp2x = startX + (targetX - startX) * 0.8 + (Math.random() - 0.5) * 100;
    const cp2y = startY + (targetY - startY) * 0.2 + (Math.random() - 0.5) * 100;


    return new Promise(resolve => {
        function animateMove(currentTime) {
            const elapsedTime = currentTime - startTime;
            let progress = Math.min(elapsedTime / duration, 1);
            progress = easeInOutQuad(progress); // Apply easing

            // Bezier curve formula
            const currentX = Math.pow(1 - progress, 3) * startX + 3 * Math.pow(1 - progress, 2) * progress * cp1x + 3 * (1 - progress) * Math.pow(progress, 2) * cp2x + Math.pow(progress, 3) * targetX;
            const currentY = Math.pow(1 - progress, 3) * startY + 3 * Math.pow(1 - progress, 2) * progress * cp1y + 3 * (1 - progress) * Math.pow(progress, 2) * cp2y + Math.pow(progress, 3) * targetY;
            
            // Update fake pointer position
            pointer.style.left = `${currentX}px`;
            pointer.style.top = `${currentY}px`;
            
            // Fire mousemove events on the element under the pointer
            const elementUnderPointer = document.elementFromPoint(currentX, currentY);
            if (elementUnderPointer) {
                 elementUnderPointer.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: currentX, clientY: currentY }));
            }


            if (progress < 1) {
                requestAnimationFrame(animateMove);
            } else {
                document.body.removeChild(pointer); // Clean up fake pointer

                // Simulate the final click events
                element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, view: window, cancelable: true }));
                element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, view: window, cancelable: true }));
                element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window, cancelable: true, buttons: 1 }));
                element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window, cancelable: true }));
                element.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window, cancelable: true }));
                
                resolve();
            }
        }
        requestAnimationFrame(animateMove);
    });
}
// --- Keyboard Simulation Functions ---

const qwertyNeighbors = {
    'q': 'wa', 'w': 'qase', 'e': 'wsdr', 'r': 'edft', 't': 'rfgy', 'y': 'tghu', 'u': 'yhji',
    'i': 'ujko', 'o': 'iklp', 'p': 'ol[', 'a': 'qwsz', 's': 'awdxz', 'd': 'serfcx', 'f': 'drtgvc',
    'g': 'ftyhbv', 'h': 'gyujnb', 'j': 'huikmn', 'k': 'jiol,m', 'l': 'kop;.,', 'z': 'asx',
    'x': 'zsdc', 'c': 'xdfv', 'v': 'cfgb', 'b': 'vghn', 'n': 'bhjm', 'm': 'njk,'
};

/**
 * Simulates human-like typing into an input element.
 * @param {HTMLInputElement} element - The target input element.
 * @param {string} text - The text to type.
 * @param {object} [options] - Optional parameters.
 * @param {number} [options.typoChance=0.02] - The chance (0 to 1) of making a typo on a character.
 */
async function humanizedType(element, text, options = {}) {
    const { typoChance = 0.02 } = options;
    element.focus();

    for (const char of text) {
        // Chance to make a typo
        if (Math.random() < typoChance && qwertyNeighbors[char.toLowerCase()]) {
            const neighbors = qwertyNeighbors[char.toLowerCase()];
            const typo = neighbors[Math.floor(Math.random() * neighbors.length)];
            
            element.value += typo;
            await typingDelay();

            // "Correct" the typo
            element.value = element.value.slice(0, -1);
            await realisticDelay(150, 50); // Delay for backspace
        }

        element.value += char;
        element.dispatchEvent(new Event('input', { bubbles: true })); // Important for frameworks like React/Vue
        await typingDelay();
    }
    
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
}