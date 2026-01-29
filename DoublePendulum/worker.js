// Simulation constants (must match main script)
const SIM_DT = 0.01;
const SPRING_K = 10;
const SPRING_GRAVITY_SCALE = 0.0001;
const SPRING_FORCE_SCALE = 0.01;

// RK4 Numerical Solver
// Uses proper double pendulum equations of motion
function simulateNumerical(data) {
    const { 
        count, 
        p1x, p1y, p2x, p2y, 
        v1x, v1y, v2x, v2y,
        theta1, theta2, omega1, omega2,
        L1, L2, m1, m2, gNumerical, iterations,
        dt = SIM_DT  // Allow custom timestep, default to SIM_DT
    } = data;

    function deriv(t1, t2, w1, w2) {
        const delta = t1 - t2;
        const sinDelta = Math.sin(delta);
        const cosDelta = Math.cos(delta);
        const denom = 2 * m1 + m2 - m2 * Math.cos(2 * delta);

        const dw1 = (
            -gNumerical * (2 * m1 + m2) * Math.sin(t1)
            - m2 * gNumerical * Math.sin(t1 - 2 * t2)
            - 2 * sinDelta * m2 * (w2 * w2 * L2 + w1 * w1 * L1 * cosDelta)
        ) / (L1 * denom);

        const dw2 = (
            2 * sinDelta * (
                w1 * w1 * L1 * (m1 + m2)
                + gNumerical * (m1 + m2) * Math.cos(t1)
                + w2 * w2 * L2 * m2 * cosDelta
            )
        ) / (L2 * denom);

        return [w1, w2, dw1, dw2];
    }

    for (let i = 0; i < count; i++) {
        let t1 = theta1[i];
        let t2 = theta2[i];
        let w1 = omega1[i];
        let w2 = omega2[i];

        for (let step = 0; step < iterations; step++) {
            const [k1t1, k1t2, k1w1, k1w2] = deriv(t1, t2, w1, w2);

            const t1_2 = t1 + 0.5 * dt * k1t1;
            const t2_2 = t2 + 0.5 * dt * k1t2;
            const w1_2 = w1 + 0.5 * dt * k1w1;
            const w2_2 = w2 + 0.5 * dt * k1w2;
            const [k2t1, k2t2, k2w1, k2w2] = deriv(t1_2, t2_2, w1_2, w2_2);

            const t1_3 = t1 + 0.5 * dt * k2t1;
            const t2_3 = t2 + 0.5 * dt * k2t2;
            const w1_3 = w1 + 0.5 * dt * k2w1;
            const w2_3 = w2 + 0.5 * dt * k2w2;
            const [k3t1, k3t2, k3w1, k3w2] = deriv(t1_3, t2_3, w1_3, w2_3);

            const t1_4 = t1 + dt * k3t1;
            const t2_4 = t2 + dt * k3t2;
            const w1_4 = w1 + dt * k3w1;
            const w2_4 = w2 + dt * k3w2;
            const [k4t1, k4t2, k4w1, k4w2] = deriv(t1_4, t2_4, w1_4, w2_4);

            t1 += (dt / 6) * (k1t1 + 2 * k2t1 + 2 * k3t1 + k4t1);
            t2 += (dt / 6) * (k1t2 + 2 * k2t2 + 2 * k3t2 + k4t2);
            w1 += (dt / 6) * (k1w1 + 2 * k2w1 + 2 * k3w1 + k4w1);
            w2 += (dt / 6) * (k1w2 + 2 * k2w2 + 2 * k3w2 + k4w2);
        }

        theta1[i] = t1;
        theta2[i] = t2;
        omega1[i] = w1;
        omega2[i] = w2;

        const sin1 = Math.sin(t1);
        const cos1 = Math.cos(t1);
        const sin2 = Math.sin(t2);
        const cos2 = Math.cos(t2);

        p1x[i] = L1 * sin1;
        p1y[i] = L1 * cos1;
        p2x[i] = p1x[i] + L2 * sin2;
        p2y[i] = p1y[i] + L2 * cos2;

        v1x[i] = L1 * cos1 * w1;
        v1y[i] = -L1 * sin1 * w1;
        v2x[i] = v1x[i] + L2 * cos2 * w2;
        v2y[i] = v1y[i] - L2 * sin2 * w2;
    }
}

// Spring Constraint Solver
// Uses spring forces to maintain arm lengths (approximate method)
function simulateSpring(data) {
    const { 
        count, 
        p1x, p1y, p2x, p2y, 
        v1x, v1y, v2x, v2y,
        L1, L2, m1, m2, gNumerical, iterations
    } = data;

    for (let step = 0; step < iterations; step++) {
        for (let i = 0; i < count; i++) {
            // Apply gravity (same acceleration for all masses)
            v1y[i] += SPRING_GRAVITY_SCALE * gNumerical;
            v2y[i] += SPRING_GRAVITY_SCALE * gNumerical;

            // Constraint 1 (pivot to bob1)
            const d1Sq = p1x[i] * p1x[i] + p1y[i] * p1y[i];
            const d1 = Math.sqrt(d1Sq);
            const diff1 = d1 - L1;
            const n1x = p1x[i] / d1;
            const n1y = p1y[i] / d1;
            const f1 = SPRING_K * diff1;
            // Acceleration = Force / mass
            v1x[i] -= SPRING_FORCE_SCALE * (f1 / m1) * n1x;
            v1y[i] -= SPRING_FORCE_SCALE * (f1 / m1) * n1y;

            // Constraint 2 (bob1 to bob2)
            const dx = p2x[i] - p1x[i];
            const dy = p2y[i] - p1y[i];
            const d2Sq = dx*dx + dy*dy;
            const d2 = Math.sqrt(d2Sq);
            const diff2 = d2 - L2;
            const n2x = dx / d2;
            const n2y = dy / d2;
            const f2 = SPRING_K * diff2;
            // Spring force acts on both bobs, acceleration depends on each mass
            v2x[i] -= SPRING_FORCE_SCALE * (f2 / m2) * n2x;
            v2y[i] -= SPRING_FORCE_SCALE * (f2 / m2) * n2y;
            v1x[i] += SPRING_FORCE_SCALE * (f2 / m1) * n2x;
            v1y[i] += SPRING_FORCE_SCALE * (f2 / m1) * n2y;

            // Update Position
            p1x[i] += v1x[i];
            p1y[i] += v1y[i];
            p2x[i] += v2x[i];
            p2y[i] += v2y[i];
        }
    }
}

// Helper function to wrap angles to [-2*PI, 2*PI) range
function wrapAngle(angle) {
    const TWO_PI = 2 * Math.PI;
    const FOUR_PI = 4 * Math.PI;
    // Wrap to [-2*PI, 2*PI) range
    // Handle negative modulo correctly
    let wrapped = ((angle + TWO_PI) % FOUR_PI);
    if (wrapped < 0) wrapped += FOUR_PI;
    return wrapped - TWO_PI;
}

// Trajectory mode: simulate single pendulum, collect angles at each step
// Reuses existing simulation functions to avoid code duplication
function simulateTrajectory(data) {
    const { initTheta1, initTheta2, L1, L2, m1, m2, gNumerical, steps, useNumerical } = data;
    
    // Create single-element arrays for the simulation functions
    const p1x = new Float32Array(1);
    const p1y = new Float32Array(1);
    const p2x = new Float32Array(1);
    const p2y = new Float32Array(1);
    const v1x = new Float32Array(1);
    const v1y = new Float32Array(1);
    const v2x = new Float32Array(1);
    const v2y = new Float32Array(1);
    const theta1 = new Float32Array(1);
    const theta2 = new Float32Array(1);
    const omega1 = new Float32Array(1);
    const omega2 = new Float32Array(1);
    
    // Initialise from angles
    theta1[0] = initTheta1;
    theta2[0] = initTheta2;
    omega1[0] = 0;
    omega2[0] = 0;
    
    const sin1 = Math.sin(initTheta1);
    const cos1 = Math.cos(initTheta1);
    const sin2 = Math.sin(initTheta2);
    const cos2 = Math.cos(initTheta2);
    p1x[0] = L1 * sin1;
    p1y[0] = L1 * cos1;
    p2x[0] = p1x[0] + L2 * sin2;
    p2y[0] = p1y[0] + L2 * cos2;
    v1x[0] = 0; v1y[0] = 0;
    v2x[0] = 0; v2y[0] = 0;
    
    // Collect trajectory as [angle1, angle2] pairs
    const trajectory = new Float32Array(steps * 2);
    
    const simData = {
        count: 1,
        p1x, p1y, p2x, p2y,
        v1x, v1y, v2x, v2y,
        theta1, theta2, omega1, omega2,
        L1, L2, m1, m2, gNumerical,
        iterations: 1,
        dt: SIM_DT
    };
    
    for (let s = 0; s < steps; s++) {
        // Run one step using existing simulation function
        if (useNumerical) {
            simulateNumerical(simData);
        } else {
            simulateSpring(simData);
            // Derive angles from positions for spring solver
            theta1[0] = Math.atan2(p1x[0], p1y[0]);
            theta2[0] = Math.atan2(p2x[0] - p1x[0], p2y[0] - p1y[0]);
        }
        
        // Store angles with wrapping to [-2*PI, 2*PI) range
        trajectory[s * 2] = wrapAngle(theta1[0]);
        trajectory[s * 2 + 1] = wrapAngle(theta2[0]);
    }
    
    return trajectory;
}

self.onmessage = function(e) {
    const start = performance.now();
    const { startIndex, useNumerical, trajectoryMode } = e.data;

    // Trajectory mode: simulate single pendulum and return angle history
    if (trajectoryMode) {
        const trajectory = simulateTrajectory(e.data);
        const end = performance.now();
        self.postMessage({
            trajectoryMode: true,
            trajectory,
            duration: end - start
        }, [trajectory.buffer]);
        return;
    }

    // Batch mode: run simulation on array of pendulums
    if (useNumerical) {
        simulateNumerical(e.data);
    } else {
        simulateSpring(e.data);
    }

    // Return updated buffers
    const { 
        p1x, p1y, p2x, p2y, 
        v1x, v1y, v2x, v2y,
        theta1, theta2, omega1, omega2,
        iterations
    } = e.data; 
    const end = performance.now();
    self.postMessage({
        startIndex,
        p1x, p1y, p2x, p2y,
        v1x, v1y, v2x, v2y,
        theta1, theta2, omega1, omega2,
        iterations,
        duration: end - start
    }, [
        p1x.buffer, p1y.buffer, p2x.buffer, p2y.buffer,
        v1x.buffer, v1y.buffer, v2x.buffer, v2y.buffer,
        theta1.buffer, theta2.buffer, omega1.buffer, omega2.buffer
    ]);
};

