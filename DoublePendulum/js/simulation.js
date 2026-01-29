// Worker management and simulation coordination

// Initialise Workers
function initWorkers() {
    // Terminate old workers
    workers.forEach(w => w.terminate());
    workers = [];
    
    for(let i = 0; i < workerCount; i++) {
        const w = new Worker(workerUrl);
        w.onmessage = handleWorkerMessage;
        workers.push(w);
    }
    pendingWorkers = 0;
    isSimulating = false;
}

// Dedicated worker for trajectory simulation (phase plot)
let trajectoryWorker = new Worker(workerUrl);
let trajectoryRequestId = 0;
let trajectoryPendingResolves = new Map();

trajectoryWorker.onmessage = function(e) {
    if (e.data.trajectoryMode && e.data.requestId !== undefined) {
        const resolve = trajectoryPendingResolves.get(e.data.requestId);
        if (resolve) {
            resolve(e.data.trajectory);
            trajectoryPendingResolves.delete(e.data.requestId);
        }
    }
};

// Async function to simulate a single pendulum and get trajectory
function simulateTrajectoryAsync(initTheta1, initTheta2, steps, dt = SIM_DT) {
    return new Promise((resolve) => {
        const requestId = ++trajectoryRequestId;
        trajectoryPendingResolves.set(requestId, resolve);
        trajectoryWorker.postMessage({
            trajectoryMode: true,
            requestId,
            initTheta1,
            initTheta2,
            L1, L2, m1, m2, gNumerical,
            steps,
            useNumerical,
            dt
        });
    });
}

function syncAngleStateFromPositions(startIndex = 0, length = count) {
    const end = Math.min(startIndex + length, count);
    for (let i = startIndex; i < end; i++) {
        const t1 = Math.atan2(p1x[i], p1y[i]);
        const dx = p2x[i] - p1x[i];
        const dy = p2y[i] - p1y[i];
        const t2 = Math.atan2(dx, dy);
        const w1 = (v1x[i] * Math.cos(t1) + v1y[i] * (-Math.sin(t1))) / L1;
        const v2rx = v2x[i] - v1x[i];
        const v2ry = v2y[i] - v1y[i];
        const w2 = (v2rx * Math.cos(t2) + v2ry * (-Math.sin(t2))) / L2;
        theta1[i] = t1;
        theta2[i] = t2;
        omega1[i] = w1;
        omega2[i] = w2;
    }
}

function handleWorkerMessage(e) {
    // Guard against stale messages after reset
    if (workers.indexOf(e.target) === -1) return;

    const { 
        startIndex, 
        p1x: wp1x, p1y: wp1y, p2x: wp2x, p2y: wp2y, 
        v1x: wv1x, v1y: wv1y, v2x: wv2x, v2y: wv2y,
        theta1: wTheta1, theta2: wTheta2, omega1: wOmega1, omega2: wOmega2,
        iterations, duration
    } = e.data;
    
    if (duration > currentStepMaxDuration) currentStepMaxDuration = duration;

    // Guard against array size mismatch if mode changed
    if (startIndex + wp1x.length > p1x.length) return;

    // Copy back data
    // Since we use transferables, the worker sent us the buffers back.
    // We need to put them into our main arrays.
    // We can use .set() for TypedArrays.
    
    p1x.set(wp1x, startIndex);
    p1y.set(wp1y, startIndex);
    p2x.set(wp2x, startIndex);
    p2y.set(wp2y, startIndex);
    v1x.set(wv1x, startIndex);
    v1y.set(wv1y, startIndex);
    v2x.set(wv2x, startIndex);
    v2y.set(wv2y, startIndex);
    theta1.set(wTheta1, startIndex);
    theta2.set(wTheta2, startIndex);
    omega1.set(wOmega1, startIndex);
    omega2.set(wOmega2, startIndex);

    pendingWorkers--;
    
    if (pendingWorkers === 0) {
        // All done for this step
        isSimulating = false;
        
        if (!isCatchingUp) {
            totalSimulationSteps += iterations; // Increment threaded step count
        }
        
        lastSimTime = currentStepMaxDuration;
    }
}

function resetGridPositions() {
    for (let i = 0; i < count; i++) {
        let th1, th2;

        if (currentMode === 'single') {
            th1 = 3 * Math.PI / 4;
            th2 = Math.PI / 2;
        } else {
            // Grid or Map
            const x = i % cols;
            const y = Math.floor(i / cols);
            
            if (currentMode === 'grid') {
                th1 = (x / cols) * 2 * Math.PI - Math.PI;
                th2 = (y / rows) * 2 * Math.PI - Math.PI;
            } else { // map
                th1 = viewMinT1 + (x / cols) * (viewMaxT1 - viewMinT1);
                th2 = viewMinT2 + (y / rows) * (viewMaxT2 - viewMinT2);
            }
        }

        theta1[i] = th1;
        theta2[i] = th2;
        omega1[i] = 0;
        omega2[i] = 0;

        // Initial positions
        const sin1 = Math.sin(th1);
        const cos1 = Math.cos(th1);
        const sin2 = Math.sin(th2);
        const cos2 = Math.cos(th2);
        p1x[i] = L1 * sin1;
        p1y[i] = L1 * cos1;
        p2x[i] = p1x[i] + L2 * sin2;
        p2y[i] = p1y[i] + L2 * cos2;
        
        // Velocity 0
        v1x[i] = 0; v1y[i] = 0;
        v2x[i] = 0; v2y[i] = 0;
    }
}

function startCatchUp() {
    // Re-init workers to clear queues
    initWorkers();
    
    // Reset pixel positions to t=0 based on NEW view
    resetGridPositions();
    
    isCatchingUp = true;
    catchUpCursor = 0;
    // Calculate batch size to maintain constant load:
    // Work = Count * Steps.
    // PixelsPerFrame = Count / Steps.
    // Clamp to at least 1 pixel.
    catchUpBatchSize = 5*Math.max(1, Math.ceil(count / Math.max(1, totalSimulationSteps)));
    
    // Limit batch size to something reasonable (e.g. 5% of screen) to avoid long blocking if steps is small
    // If steps=1, batch=count. 1000000 pixels. Blocking.
    // If normal sim runs 1M pixels for 1 step, then doing 1M pixels for 1 step is same cost.
    // So logic holds.
}

function initSimulation() {
    // Cancel any pending simulation
    isSimulating = false;
    pendingWorkers = 0;
    isCatchingUp = false;
    // Force redraw of side panels
    activePendulumIndex = -1;
    
    // Re-init workers to clear any pending messages queue
    initWorkers();

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    totalSimulationSteps = 0;

    if (currentMode === 'single') {
        energyPanel.style.display = 'block';
    } else {
        energyPanel.style.display = 'none';
    }

    if (currentMode === 'map') {
        cols = canvas.width;
        rows = canvas.height;
        gApprox = 0.00003;
        gNumerical = gApprox * GRAVITY_SCALE;
    } else if (currentMode === 'grid') {
        cols = Math.ceil(canvas.width / GRID_CELL_SIZE);
        rows = Math.ceil(canvas.height / GRID_CELL_SIZE);
        gApprox = 0.000003;
        gNumerical = gApprox * GRAVITY_SCALE;
        // Fit length 2 (L1+L2) into ~15px radius.
        // 2 * scale = 15 => scale = 7.5
        renderScale = 7.5;
    } else { // single
        cols = 1;
        rows = 1;
        gApprox = 0.000003;
        gNumerical = gApprox * GRAVITY_SCALE;
        // Fit length 2 into 1/3 screen min dimension (Zoomed in)
        renderScale = (Math.min(canvas.width, canvas.height) / 3) / 2; // Divide by total length (2)
        
        // Clear trails on reset
        singleTrail1 = [];
        singleTrail2 = [];
    }
    
    count = cols * rows;

    // Allocate memory
    p1x = new Float32Array(count);
    p1y = new Float32Array(count);
    p2x = new Float32Array(count);
    p2y = new Float32Array(count);
    v1x = new Float32Array(count);
    v1y = new Float32Array(count);
    v2x = new Float32Array(count);
    v2y = new Float32Array(count);
    neighbourDeltas = new Float32Array(count);
    theta1 = new Float32Array(count);
    theta2 = new Float32Array(count);
    omega1 = new Float32Array(count);
    omega2 = new Float32Array(count);

    if (currentMode === 'map') {
        imageData = ctx.createImageData(cols, rows);
        buf32 = new Uint32Array(imageData.data.buffer);
    } else {
        imageData = null;
        buf32 = null;
    }

    resetGridPositions();
}

function simulateThreaded(iterations, globalStart = 0, globalLen = count, dt = 0.01) {
    if (isSimulating) return; // Wait for previous step
    isSimulating = true;
    pendingWorkers = workerCount;
    currentStepMaxDuration = 0;
    
    const chunkSize = Math.ceil(globalLen / workerCount);

    for (let i = 0; i < workerCount; i++) {
        const relativeStart = i * chunkSize;
        const absoluteStart = globalStart + relativeStart;
        const end = Math.min(absoluteStart + chunkSize, globalStart + globalLen);
        const chunkCount = end - absoluteStart;
        
        if (chunkCount <= 0) {
            pendingWorkers--;
            continue;
        }

        // Create copies/slices to send. 
        // Slice creates a copy. TypedArray.slice() is fast-ish.
        // We send these as Transferables so they arrive zero-copy on the worker side? 
        // No, slice creates new buffer. We transfer that new buffer.
        
        const s_p1x = p1x.slice(absoluteStart, end);
        const s_p1y = p1y.slice(absoluteStart, end);
        const s_p2x = p2x.slice(absoluteStart, end);
        const s_p2y = p2y.slice(absoluteStart, end);
        const s_v1x = v1x.slice(absoluteStart, end);
        const s_v1y = v1y.slice(absoluteStart, end);
        const s_v2x = v2x.slice(absoluteStart, end);
        const s_v2y = v2y.slice(absoluteStart, end);
        const s_theta1 = theta1.slice(absoluteStart, end);
        const s_theta2 = theta2.slice(absoluteStart, end);
        const s_omega1 = omega1.slice(absoluteStart, end);
        const s_omega2 = omega2.slice(absoluteStart, end);

        workers[i].postMessage({
            startIndex: absoluteStart,
            count: chunkCount,
            p1x: s_p1x, p1y: s_p1y, p2x: s_p2x, p2y: s_p2y,
            v1x: s_v1x, v1y: s_v1y, v2x: s_v2x, v2y: s_v2y,
            theta1: s_theta1, theta2: s_theta2, omega1: s_omega1, omega2: s_omega2,
            L1, L2, m1, m2, gNumerical, iterations, dt,
            useNumerical
        }, [
            s_p1x.buffer, s_p1y.buffer, s_p2x.buffer, s_p2y.buffer,
            s_v1x.buffer, s_v1y.buffer, s_v2x.buffer, s_v2y.buffer,
            s_theta1.buffer, s_theta2.buffer, s_omega1.buffer, s_omega2.buffer
        ]);
    }
}

