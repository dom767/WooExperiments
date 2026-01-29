// Rendering functions for map, grid, single, mini pendulum, and phase plot

// Calculate initial angles for a pendulum based on its index and current mode
function getInitialAngles(index) {
    let initTheta1, initTheta2;
    if (currentMode === 'single') {
        initTheta1 = 3 * Math.PI / 4;
        initTheta2 = Math.PI / 2;
    } else {
        const x = index % cols;
        const y = Math.floor(index / cols);
        
        if (currentMode === 'grid') {
            initTheta1 = (x / cols) * 2 * Math.PI - Math.PI;
            initTheta2 = (y / rows) * 2 * Math.PI - Math.PI;
        } else { // map
            initTheta1 = viewMinT1 + (x / cols) * (viewMaxT1 - viewMinT1);
            initTheta2 = viewMinT2 + (y / rows) * (viewMaxT2 - viewMinT2);
        }
    }
    return { initTheta1, initTheta2 };
}

// Draw trajectory from angle array to phase canvas
function drawTrajectoryToPhaseCanvas(index, trajectory) {
    const pcx = phaseCanvas.width / 2;
    const pcy = phaseCanvas.height / 2;
    const pScaleX = phaseCanvas.width / (2 * Math.PI);
    const pScaleY = phaseCanvas.height / (2 * Math.PI);

    phaseCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    phaseCtx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    phaseCtx.lineWidth = 1;
    
    const steps = trajectory.length / 2;
    let prevPx, prevPy;
    let angle1, angle2;
    
    phaseCtx.fillStyle = 'rgba(0,0,0,1)';
    phaseCtx.fillRect(pcx + trajectory[0] * pScaleX, pcy + trajectory[1] * pScaleY, 3,3);
    phaseCtx.fillStyle = 'rgba(255,0,0,1)';
    phaseCtx.fillRect(pcx + trajectory[(steps-1)*2] * pScaleX, pcy + trajectory[(steps-1)*2+1] * pScaleY, 3,3);
    angle1 = Math.atan2(p1x[index], p1y[index]);
    const dx = p2x[index] - p1x[index];
    const dy = p2y[index] - p1y[index];
    angle2 = Math.atan2(dx, dy);
    phaseCtx.fillStyle = 'rgba(0,255,0,1)';
    phaseCtx.fillRect(pcx + angle1 * pScaleX, pcy + angle2 * pScaleY, 3,3);

    for (let s = 0; s < steps; s++) {
        angle1 = trajectory[s * 2];
        angle2 = trajectory[s * 2 + 1];
        
        const px = pcx + angle1 * pScaleX;
        const py = pcy + angle2 * pScaleY;

        if (s > 0) {
            const distSq = (px-prevPx)*(px-prevPx) + (py-prevPy)*(py-prevPy);
            const wrapThresholdSq = (phaseCanvas.width/2)*(phaseCanvas.width/2);
            
            if (distSq < wrapThresholdSq) {
                phaseCtx.beginPath();
                phaseCtx.moveTo(prevPx, prevPy);
                phaseCtx.lineTo(px, py);
                phaseCtx.stroke();
            }
            phaseCtx.fillRect(Math.floor(px), Math.floor(py), 1, 1);
        }
        prevPx = px; prevPy = py;
    }
    
    // Return final point info
    return { 
        t1: angle1, 
        t2: angle2, 
        px: prevPx, 
        py: prevPy 
    };
}

// Async function to re-simulate a pendulum using the worker (no physics duplication)
async function resimulatePendulum(index, steps) {
    const { initTheta1, initTheta2 } = getInitialAngles(index);
    // Capture state at start to detect changes during async operation
    const startViewMinT1 = viewMinT1;
    const startViewMaxT1 = viewMaxT1;
    const startViewMinT2 = viewMinT2;
    const startViewMaxT2 = viewMaxT2;
    const startCatchingUp = isCatchingUp;
    
    // Use worker to simulate trajectory (reuses worker's simulation code)
    // Match the dt used in the current simulation mode so the trajectory duration aligns.
    let trajDt = SIM_DT;
    if (currentMode === 'map') {
        trajDt = useNumerical ? 0.08 : 0.01; // map mode uses larger dt for numerical; spring stays at 0.01
    }
    const trajectory = await simulateTrajectoryAsync(initTheta1, initTheta2, steps, trajDt);

    // Check if we're still viewing the same pendulum (avoid race condition)
    if (activePendulumIndex !== index) {
        return null;
    }
    // Check if view bounds changed during async operation (zoom occurred)
    if (viewMinT1 !== startViewMinT1 || viewMaxT1 !== startViewMaxT1 ||
        viewMinT2 !== startViewMinT2 || viewMaxT2 !== startViewMaxT2) {
        return null;
    }
    // Check if catch-up state changed (pendulum states may be inconsistent)
    if (isCatchingUp !== startCatchingUp) {
        return null;
    }
    // Don't draw during catch-up as pendulum states are being progressively updated
    if (isCatchingUp) {
        return null;
    }

    // Draw trajectory to phase canvas
    return drawTrajectoryToPhaseCanvas(index, trajectory);
}

// Helper for HSL to RGB
function hslToRgb(h, s, l){
    let r, g, b;
    if(s === 0){
        r = g = b = l; // achromatic
    }else{
        const hue2rgb = function hue2rgb(p, q, t){
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [(r * 255), (g * 255), (b * 255)];
}

function calcNeighbourDeltas() {
    let total = 0;
    for (let i = 0; i < count; i++) {
        const x = i % cols;
        const y = Math.floor(i / cols);
        let totalDist = 0;
        let neighbourCount = 0;

        // Left
        if (x > 0) {
            const ni = i - 1;
            const d2 = Math.sqrt((p2x[i] - p2x[ni])**2 + (p2y[i] - p2y[ni])**2);
            totalDist += d2;
            neighbourCount++;
        }
        // Right
        if (x < cols - 1) {
            const ni = i + 1;
            const d2 = Math.sqrt((p2x[i] - p2x[ni])**2 + (p2y[i] - p2y[ni])**2);
            totalDist += d2;
            neighbourCount++;
        }
        // Up
        if (y > 0) {
            const ni = i - cols;
            const d2 = Math.sqrt((p2x[i] - p2x[ni])**2 + (p2y[i] - p2y[ni])**2);
            totalDist += d2;
            neighbourCount++;
        }
        // Down
        if (y < rows - 1) {
            const ni = i + cols;
            const d2 = Math.sqrt((p2x[i] - p2x[ni])**2 + (p2y[i] - p2y[ni])**2);
            totalDist += d2;
            neighbourCount++;
        }

        const avgDist = neighbourCount > 0 ? totalDist / neighbourCount : 0;
        neighbourDeltas[i] = avgDist;
        total += avgDist;
    }
    totalNeighbourDelta = total;
}

function getColour(i) {
    let r = 0, gr = 0, b = 0;

    if (currentColourMode === 'angles') {
        const dx = p2x[i] - p1x[i];
        const dy = p2y[i] - p1y[i];

        const cos1 = p1y[i] / L1;
        const cos2 = dy / L2;

        let w1 = (1 - cos1) / 2;
        let w2 = (1 - cos2) / 2;

        if (w1<0) w1 = 0;
        if (w2<0) w2 = 0;

        r = w1 * 255;
        gr = (w1 * 160) + (w2 * 95);
        b = w2 * 255;
    } else if (currentColourMode === 'momentum') {
        // Velocity magnitude of P2
        const vScale = useNumerical ? 1 : Math.sqrt(SPRING_VELOCITY_SQ_SCALE);
        const vx = v2x[i] * vScale;
        const vy = v2y[i] * vScale;
        const speed = Math.sqrt(vx*vx + vy*vy);

        const maxSpeed = Math.sqrt(2 * gNumerical * (L1 + L2) * 2);
        
        let t = speed / maxSpeed;
        t = Math.pow(t, 0.7);
        if (t > 1) t = 1;

        const hue = (1 - t) * 240;
        const rgb = hslToRgb(hue / 360, 1.0, 0.5);
        r = rgb[0];
        gr = rgb[1];
        b = rgb[2];
    } else if (currentColourMode === 'neighbour') {
        const avgDist = neighbourDeltas[i];
        
        const frameAvg = totalNeighbourDelta / count;
        const scale = (frameAvg * 4.0) > 0.000001 ? (frameAvg * 4.0) : 0.000001;

        let t = avgDist / scale;
        if (t > 1) t = 1;

        if (t < 0.5) {
            r = 0;
            gr = 0;
            b = (t / 0.5) * 255;
        } else {
            b = 255;
            const val = ((t - 0.5) / 0.5) * 255;
            r = val;
            gr = val;
        }
    }

    if (r > 255) r = 255;
    if (gr > 255) gr = 255;
    if (b > 255) b = 255;

    return [Math.floor(r), Math.floor(gr), Math.floor(b)];
}

function drawMap() {
    if (!imageData) return;
    for (let i = 0; i < count; i++) {
        const [r, g, b] = getColour(i);
        buf32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
    ctx.putImageData(imageData, 0, 0);
    colourPanel.style.display = 'none';
}

function drawGrid() {
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    colourPanel.style.display = 'none';

    for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = col * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
        const cy = row * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
        
        const [r, g, b] = getColour(i);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`; 
        ctx.fillRect(col * GRID_CELL_SIZE, row * GRID_CELL_SIZE, GRID_CELL_SIZE, GRID_CELL_SIZE);
        
        ctx.fillStyle = 'white'; 
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;

        const x1 = cx + p1x[i] * renderScale;
        const y1 = cy + p1y[i] * renderScale;
        const x2 = cx + p2x[i] * renderScale;
        const y2 = cy + p2y[i] * renderScale;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const radius = 2;
        ctx.beginPath();
        ctx.arc(x1, y1, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x2, y2, radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawSingle() {
    // Fill background - Black
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (count === 0) return;
    const i = 0;
    const [colourR, colourG, colourB] = getColour(i);

    // Update Swatch
    colourSwatch.style.backgroundColor = `rgb(${colourR}, ${colourG}, ${colourB})`;
    colourPanel.style.display = 'flex';

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    
    // Positions
    const x1 = cx + p1x[i] * renderScale;
    const y1 = cy + p1y[i] * renderScale;
    const x2 = cx + p2x[i] * renderScale;
    const y2 = cy + p2y[i] * renderScale;

    // Trails
    if (!isPaused) {
        singleTrail1.push({x: x1, y: y1});
        singleTrail2.push({x: x2, y: y2});
        if (singleTrail1.length > SINGLE_TRAIL_LENGTH) singleTrail1.shift();
        if (singleTrail2.length > SINGLE_TRAIL_LENGTH) singleTrail2.shift();
    }

    ctx.lineWidth = 1;
    // Trail 1
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    if (singleTrail1.length > 0) {
        ctx.moveTo(singleTrail1[0].x, singleTrail1[0].y);
        for (let t=1; t<singleTrail1.length; t++) {
            ctx.lineTo(singleTrail1[t].x, singleTrail1[t].y);
        }
        ctx.lineTo(x1, y1);
    }
    ctx.stroke();

    // Trail 2
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
    ctx.beginPath();
    if (singleTrail2.length > 0) {
        ctx.moveTo(singleTrail2[0].x, singleTrail2[0].y);
        for (let t=1; t<singleTrail2.length; t++) {
            ctx.lineTo(singleTrail2[t].x, singleTrail2[t].y);
        }
        ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // Draw Pendulum
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'white';
    ctx.fillStyle = 'white';
    
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const radius = 10;
    ctx.beginPath();
    ctx.arc(x1, y1, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x2, y2, radius, 0, Math.PI * 2);
    ctx.fill();

    // Stats
    const pe1 = m1 * gNumerical * (L1 - p1y[i]);
    const pe2 = m2 * gNumerical * ((L1 + L2) - p2y[i]);
    const totalPE = pe1 + pe2;
    
    const vScale = useNumerical ? 1 : SPRING_VELOCITY_SQ_SCALE;
    const v1Sq = (v1x[i] * v1x[i] + v1y[i] * v1y[i]) * vScale;
    const v2Sq = (v2x[i] * v2x[i] + v2y[i] * v2y[i]) * vScale;
    const ke1 = 0.5 * m1 * v1Sq;
    const ke2 = 0.5 * m2 * v2Sq;
    const totalKE = ke1 + ke2;
    const totalEnergy = totalPE + totalKE;
    
    const d1 = Math.sqrt(p1x[i] * p1x[i] + p1y[i] * p1y[i]);
    const dx = p2x[i] - p1x[i];
    const dy = p2y[i] - p1y[i];
    const d2 = Math.sqrt(dx * dx + dy * dy);
    const l1DiffPct = ((d1 - L1) / L1) * 100;
    const l2DiffPct = ((d2 - L2) / L2) * 100;

    const s = 1000;
    energyStatsContent.innerHTML = `
        <strong>Energy Stats</strong><br>
        Total PE: ${(totalPE * s).toFixed(2)}<br>
        Total KE: ${(totalKE * s).toFixed(2)}<br>
        Total E:  ${(totalEnergy * s).toFixed(2)}<br>
        <br>
        <strong>Extensions</strong><br>
        L1: ${l1DiffPct.toFixed(4)}%<br>
        L2: ${l2DiffPct.toFixed(4)}%
    `;
}

function drawMiniPendulum(i) {
    miniCtx.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
    
    const mw = miniCanvas.width;
    const mh = miniCanvas.height;
    const mcx = mw / 2;
    const mcy = mh / 2;
    const mScale = (Math.min(mw, mh) / 2) * 0.4; 

    const [r, g, b] = getColour(i);
    miniCtx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
    miniCtx.fillRect(0, 0, mw, mh);

    const x1 = mcx + p1x[i] * mScale;
    const y1 = mcy + p1y[i] * mScale;
    const x2 = mcx + p2x[i] * mScale;
    const y2 = mcy + p2y[i] * mScale;

    miniCtx.strokeStyle = 'black';
    miniCtx.lineWidth = 2;
    miniCtx.beginPath();
    miniCtx.moveTo(mcx, mcy);
    miniCtx.lineTo(x1, y1);
    miniCtx.lineTo(x2, y2);
    miniCtx.stroke();

    miniCtx.fillStyle = 'black';
    miniCtx.beginPath();
    miniCtx.arc(x1, y1, 4, 0, Math.PI * 2);
    miniCtx.fill();
    miniCtx.beginPath();
    miniCtx.arc(x2, y2, 4, 0, Math.PI * 2);
    miniCtx.fill();
}

function drawPhasePlot(i) {
    if (activePendulumIndex !== i) {
        activePendulumIndex = i;
        lastPhasePoint = null;
        
        phaseCtx.fillStyle = 'white'; 
        phaseCtx.fillRect(0, 0, phaseCanvas.width, phaseCanvas.height);
        
        if (totalSimulationSteps > 0) {
            // Simulate trajectory using worker (async, updates when complete)
            resimulatePendulum(i, totalSimulationSteps).then(result => {
                // Only update if result is valid (not stale due to race condition)
                if (result && activePendulumIndex === i) {
                    lastPhasePoint = result;
                }
            });
        }
    }

    let angle1 = Math.atan2(p1x[i], p1y[i]);
    const dx = p2x[i] - p1x[i];
    const dy = p2y[i] - p1y[i];
    let angle2 = Math.atan2(dx, dy);

    const pcx = phaseCanvas.width / 2;
    const pcy = phaseCanvas.height / 2;
    const pScaleX = phaseCanvas.width / (2 * Math.PI);
    const pScaleY = phaseCanvas.height / (2 * Math.PI);
    
    const px = pcx + angle1 * pScaleX;
    const py = pcy + angle2 * pScaleY;

    // Draw segment
    if (lastPhasePoint) {
        // Draw line if not wrapped (check angle continuity)
        if (Math.abs(angle1 - lastPhasePoint.t1) < Math.PI && Math.abs(angle2 - lastPhasePoint.t2) < Math.PI) {
            phaseCtx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
            phaseCtx.lineWidth = 1;
            phaseCtx.beginPath();
            phaseCtx.moveTo(lastPhasePoint.px, lastPhasePoint.py);
            phaseCtx.lineTo(px, py);
            phaseCtx.stroke();
        }

        // Just draw dot
        phaseCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        phaseCtx.fillRect(Math.floor(px), Math.floor(py), 1, 1);
    }
    lastPhasePoint = { t1: angle1, t2: angle2, px, py };
}

function clearMiniPanels() {
    miniCtx.fillStyle = '#eee';
    miniCtx.fillRect(0, 0, miniCanvas.width, miniCanvas.height);
    phaseCtx.fillStyle = '#eee';
    phaseCtx.fillRect(0, 0, phaseCanvas.width, phaseCanvas.height);
    activePendulumIndex = -1;
}

function draw() {
    if (!ctx) return;
    const start = performance.now();
    
    // Zoom Preview Override
    if (isZooming && currentMode === 'map' && zoomSnapshot) {
        // Clear background
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const rangeT1 = viewMaxT1 - viewMinT1;
        const rangeT2 = viewMaxT2 - viewMinT2;
        
        const snapRangeT1 = zoomSnapshotBounds.maxT1 - zoomSnapshotBounds.minT1;
        const snapRangeT2 = zoomSnapshotBounds.maxT2 - zoomSnapshotBounds.minT2;
        
        const dx = ((zoomSnapshotBounds.minT1 - viewMinT1) / rangeT1) * canvas.width;
        const dy = ((zoomSnapshotBounds.minT2 - viewMinT2) / rangeT2) * canvas.height;
        const dw = (snapRangeT1 / rangeT1) * canvas.width;
        const dh = (snapRangeT2 / rangeT2) * canvas.height;
        
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(zoomSnapshot, dx, dy, dw, dh);
        
        clearMiniPanels();
        return;
    }

    if (currentColourMode === 'neighbour') {
        calcNeighbourDeltas();
    }

    // 1. Draw Main View
    if (currentMode === 'map') {
        drawMap();
    } else if (currentMode === 'grid') {
        drawGrid();
    } else { // single
        drawSingle();
    }

    // 2. Determine Target for Side Panels
    let targetIndex = -1;
    if (currentMode === 'single') {
        targetIndex = 0;
    } else if (currentMode === 'grid') {
        const col = Math.floor(mouseX / GRID_CELL_SIZE);
        const row = Math.floor(mouseY / GRID_CELL_SIZE);
        if (col >= 0 && col < cols && row >= 0 && row < rows) {
            targetIndex = row * cols + col;
        }
    } else if (currentMode === 'map') {
        const x = Math.floor(mouseX);
        const y = Math.floor(mouseY);
        if (x >= 0 && x < cols && y >= 0 && y < rows) {
            targetIndex = y * cols + x;
        }
    }

    // 3. Draw Side Panels
    if (targetIndex !== -1 && targetIndex < count) {
        drawMiniPendulum(targetIndex);
        drawPhasePlot(targetIndex);
    } else {
        clearMiniPanels();
    }

    // 4. Update Stats
    const end = performance.now();
    lastRenderTime = end - start;
    const mouseStats = currentMode !== 'single' ? `X: ${Math.floor(mouseX)}, Y: ${Math.floor(mouseY)}<br>` : '';
    perfStatsContent.innerHTML = `
        Iter: ${totalSimulationSteps.toLocaleString()}<br>
        ${mouseStats}Sim: ${lastSimTime.toFixed(2)}ms<br>
        Render: ${lastRenderTime.toFixed(2)}ms
    `;
}

