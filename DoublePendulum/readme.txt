Double Pendulum Simulation
==========================

An interactive visualisation of double pendulum physics with multiple viewing modes.


Running the Application
-----------------------

Option 1: Open index.html directly in a browser (works from file://)

Option 2: Use a local server (recommended for development)
    python -m http.server 8000
    Then open http://localhost:8000


Project Structure
-----------------

DoublePendulum/
├── index.html          # HTML markup and script loading
├── readme.txt          # This file
├── styles.css          # All CSS styles
├── worker.js           # Web Worker for parallel physics simulation
├── js/
│   ├── constants.js    # Shared constants, DOM references, state variables
│   ├── simulation.js   # Worker management, simulation coordination
│   ├── views.js        # Rendering functions (map, grid, single, phase plot)
│   ├── ui.js           # Event handlers for controls and user interaction
│   └── main.js         # Entry point, animation loop


File Responsibilities
---------------------

index.html
    HTML structure with UI panels, canvases, and script loading in dependency order.

styles.css
    Visual styling for panels, controls, and layout.

worker.js
    Web Worker physics simulation code (reference copy).
    Note: The worker is also embedded inline in index.html for file:// protocol
    compatibility. When editing, update both locations or use a local server.
    - simulateNumerical(): RK4 solver for accurate double pendulum dynamics
    - simulateSpring(): Spring constraint solver (faster, approximate)

js/constants.js
    - DOM element references
    - Physics constants (gravity scales, timesteps, spring constants)
    - State variables (positions, velocities, angles)
    - Grid/view configuration

js/simulation.js
    - initWorkers(): Initialise Web Workers for parallel processing
    - handleWorkerMessage(): Process results from workers
    - simulateThreaded(): Dispatch work to worker threads
    - initSimulation(): Reset and configure simulation state
    - resetGridPositions(): Initialise pendulum starting positions
    - startCatchUp(): Handle view change catch-up

js/views.js
    - draw(): Main rendering coordinator
    - drawMap(): Pixel-based angle map visualisation
    - drawGrid(): Grid of small pendulums
    - drawSingle(): Single large pendulum with trails
    - drawMiniPendulum(): Hover preview of selected pendulum
    - drawPhasePlot(): Phase space trajectory visualisation
    - resimulatePendulum(): Trajectory replay for phase plots
    - getColour(): Colour calculation based on current mode
    - hslToRgb(): Colour space conversion helper
    - calcNeighbourDeltas(): Neighbour distance calculation for colour mode

js/ui.js
    - Mode selection handlers
    - Colour scheme selection
    - Mass and length input handlers
    - Pause/play control
    - Zoom and pan interaction for map mode
    - Window resize handling

js/main.js
    - Animation loop (requestAnimationFrame)
    - Simulation stepping logic
    - Catch-up mode handling
    - Application startup


Script Loading Order
--------------------

Scripts must be loaded in this order due to dependencies:

1. constants.js   - No dependencies (defines globals)
2. simulation.js  - Depends on constants.js
3. views.js       - Depends on constants.js, simulation.js
4. ui.js          - Depends on constants.js, simulation.js
5. main.js        - Depends on all above (initialises application)


Simulation Modes
----------------

Single Pendulum
    Large pendulum with motion trails and energy statistics.

Pendulum Grid
    Array of pendulums showing sensitivity to initial conditions.

Angle Map
    Each pixel represents a pendulum with different initial angles.
    Supports zoom and pan interaction.


Colour Schemes
--------------

Angles
    Colour based on current pendulum arm positions.

Momentum
    Heatmap based on second bob velocity.

Neighbour Delta
    Shows divergence between adjacent pendulums (chaos visualisation).


Physics Solvers
---------------

Numerical (RK4)
    Fourth-order Runge-Kutta solver. More accurate, maintains energy conservation.

Spring Constraint
    Approximate solver using spring forces. Faster but less accurate.

