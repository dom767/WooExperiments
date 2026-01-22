// Main entry point - animation loop and startup

let lastTime = performance.now();
const timeStep = 1; // 1ms per simulation step

function animate(currentTime) {
    let deltaTime = currentTime - lastTime;
    if (deltaTime > 100) deltaTime = 100;

    if (isCatchingUp) {
        if (!isSimulating) {
            const start = performance.now();
            const processChunk = Math.min(catchUpBatchSize, count - catchUpCursor);
            
            if (processChunk > 0) {
                // Use same dt that was used during regular simulation
                const catchUpDt = useNumerical ? 0.08 : 0.01;
                simulateThreaded(totalSimulationSteps, catchUpCursor, processChunk, catchUpDt);
                catchUpCursor += processChunk;
            } else {
                isCatchingUp = false;
            }
            window.simStartTime = start;
        }
    } else if (!isPaused && !isZooming) {
        // Unified threaded simulation
        if (!isSimulating) {
            const start = performance.now();
            
            // Determine iterations and timestep
            let steps = 0;
            let dt = 0.01; // Default timestep
            
            if (currentMode === 'map') {
                if (useNumerical) {
                    // Numerical solver: single iteration with larger timestep
                    steps = 1;
                    dt = 0.08; // 8x larger timestep
                } else {
                    // Spring solver: multiple smaller steps for stability
                    steps = 8;
                    dt = 0.01;
                }
            } else {
                // Time based for others
                // Since it's async, we use the delta to determine catch-up steps
                steps = Math.floor(deltaTime / timeStep);
                if (steps < 1) steps = 1; // Ensure at least one step if not paused
            }
            
            simulateThreaded(steps, 0, count, dt);
            lastTime = currentTime;
        }
    } else {
        lastTime = currentTime; 
    }

    draw();
    requestAnimationFrame(animate);
}

// Initialise workers and start simulation
initWorkers();
initSimulation();
requestAnimationFrame(animate);

