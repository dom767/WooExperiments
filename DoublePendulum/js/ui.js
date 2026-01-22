// Event handlers for UI controls and user interaction

modeSelect.addEventListener('change', (e) => {
    currentMode = e.target.value;
    // Update UI visibility - Right panel is always visible now
    if (currentMode === 'single') {
        energyPanel.style.display = 'block';
    } else {
        energyPanel.style.display = 'none';
    }
    // Reset Zoom
    viewMinT1 = -Math.PI; viewMaxT1 = Math.PI;
    viewMinT2 = -Math.PI; viewMaxT2 = Math.PI;
    isZooming = false;
    isDragging = false;
    isCatchingUp = false;
    
    initSimulation();
});

colourSelect.addEventListener('change', (e) => {
    currentColourMode = e.target.value;
});

numericalToggle.addEventListener('change', (e) => {
    useNumerical = e.target.checked;
    if (useNumerical) {
        syncAngleStateFromPositions();
    }
    initSimulation();
});

mass1Input.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!Number.isNaN(val) && val > 0) {
        m1 = val;
        initSimulation();
    }
});

mass2Input.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!Number.isNaN(val) && val > 0) {
        m2 = val;
        initSimulation();
    }
});

pivotSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    // Map 0-100 to Ratio
    const ratio = val / 100;
    const clampedRatio = Math.max(0.01, Math.min(0.99, ratio));
    
    L1 = clampedRatio * TOTAL_LENGTH;
    L2 = (1.0 - clampedRatio) * TOTAL_LENGTH;
    
    // Reset simulation on length change
    initSimulation();
});

pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? 'Play Simulation' : 'Pause Simulation';
});

function startViewManipulation() {
    if (!isZooming) {
        isZooming = true;
        // Terminate workers to pause calculation
        workers.forEach(w => w.terminate());
        workers = []; 
        
        zoomSnapshot = document.createElement('canvas');
        zoomSnapshot.width = canvas.width;
        zoomSnapshot.height = canvas.height;
        const zCtx = zoomSnapshot.getContext('2d');
        zCtx.drawImage(canvas, 0, 0);
        zoomSnapshotBounds = { minT1: viewMinT1, maxT1: viewMaxT1, minT2: viewMinT2, maxT2: viewMaxT2 };
    }
}

function resetViewManipulationTimer() {
    if (zoomTimer) clearTimeout(zoomTimer);
    zoomTimer = setTimeout(() => {
        isZooming = false;
        isDragging = false;
        zoomSnapshot = null;
        zoomSnapshotBounds = null;
        
        // If we have history, catch up instead of reset
        if (totalSimulationSteps > 0 && currentMode === 'map') {
            startCatchUp();
        } else {
            initSimulation();
        }
    }, 1000); // 1 second pause
}

// Mouse tracking
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;

    if (isDragging && currentMode === 'map') {
        const dx = mouseX - lastDragX;
        const dy = mouseY - lastDragY;
        lastDragX = mouseX;
        lastDragY = mouseY;

        // Calculate scale (Angle per pixel)
        const rangeT1 = viewMaxT1 - viewMinT1;
        const rangeT2 = viewMaxT2 - viewMinT2;
        const scaleX = rangeT1 / canvas.width;
        const scaleY = rangeT2 / canvas.height;

        // Apply inverse delta
        const dT1 = -dx * scaleX;
        const dT2 = -dy * scaleY;

        viewMinT1 += dT1;
        viewMaxT1 += dT1;
        viewMinT2 += dT2;
        viewMaxT2 += dT2;

        resetViewManipulationTimer();
    }
});

canvas.addEventListener('mousedown', (e) => {
    if (currentMode === 'map') {
        isDragging = true;
        const rect = canvas.getBoundingClientRect();
        lastDragX = e.clientX - rect.left;
        lastDragY = e.clientY - rect.top;
        
        startViewManipulation();
        resetViewManipulationTimer();
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

// Zoom tracking
canvas.addEventListener('wheel', (e) => {
    if (currentMode !== 'map') return;
    e.preventDefault();

    // 1. Capture Snapshot if starting zoom sequence
    startViewManipulation();

    // 2. Calculate Zoom
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Current range
    const rangeT1 = viewMaxT1 - viewMinT1;
    const rangeT2 = viewMaxT2 - viewMinT2;

    // Mouse position in Theta space
    const mouseT1 = viewMinT1 + (mx / canvas.width) * rangeT1;
    const mouseT2 = viewMinT2 + (my / canvas.height) * rangeT2;

    // Zoom factor
    const k = e.deltaY < 0 ? 0.9 : 1.1; // Scroll Up = Zoom In (0.9x range)

    // New Range
    const newRangeT1 = rangeT1 * k;
    const newRangeT2 = rangeT2 * k;

    // New Bounds (centred on mouseT relative position)
    viewMinT1 = mouseT1 - (mx / canvas.width) * newRangeT1;
    viewMaxT1 = viewMinT1 + newRangeT1;
    viewMinT2 = mouseT2 - (my / canvas.height) * newRangeT2;
    viewMaxT2 = viewMinT2 + newRangeT2;

    // 3. Reset Timer
    resetViewManipulationTimer();
}, { passive: false });

// Handle window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(initSimulation, 100);
});

