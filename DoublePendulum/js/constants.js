// DOM References
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false }); 
const modeSelect = document.getElementById('modeSelect');
const colourSelect = document.getElementById('colourSelect');
const pivotSlider = document.getElementById('pivotSlider');
const numericalToggle = document.getElementById('numericalToggle');
const mass1Input = document.getElementById('mass1Input');
const mass2Input = document.getElementById('mass2Input');
const pauseBtn = document.getElementById('pauseBtn');
const perfStatsContent = document.getElementById('perfStatsContent');
const energyPanel = document.getElementById('energyPanel');
const energyStatsContent = document.getElementById('energyStatsContent');

const miniCanvas = document.getElementById('miniCanvas');
const miniCtx = miniCanvas.getContext('2d');

const phaseCanvas = document.getElementById('phaseCanvas');
const phaseCtx = phaseCanvas.getContext('2d');

const colourPanel = document.getElementById('colourPanel');
const colourSwatch = document.getElementById('colourSwatch');

// Gravity values for each solver type
// Approximate solver uses tiny g because it integrates position directly each step
// Numerical solver needs properly scaled g for RK4 with dt=0.01
const GRAVITY_SCALE = 10000;
let gApprox = 0.00001;
let gNumerical = gApprox * GRAVITY_SCALE;

// Mode state
let currentMode = 'map';
let currentColourMode = 'angles';
let isPaused = false;

// Mouse state
let mouseX = 0;
let mouseY = 0;

// Active pendulum state tracking
let activePendulumIndex = -1;
let lastPhasePoint = null; 

// Single Mode Trails
let singleTrail1 = [];
let singleTrail2 = [];
const SINGLE_TRAIL_LENGTH = 500;

// Simulation Time State for re-simulation
let totalSimulationSteps = 0;

// Constants (Standardised Physics Units)
const TOTAL_LENGTH = 2.0;
let L1 = 1.0;
let L2 = 1.0;
let m1 = 1.0;
let m2 = 1.0;
let useNumerical = true;

// Render scaling
let renderScale = 1.0;

// Simulation constants (shared with worker)
const SIM_DT = 0.01;
const SPRING_K = 10;
const SPRING_GRAVITY_SCALE = 0.0001;
const SPRING_FORCE_SCALE = 0.01;

// Velocity scale factor for spring solver to approximate physical velocity
// Numerical: gravity adds ~gNumerical * dt = 0.03 * 0.01 = 0.0003 per step
// Spring: gravity adds ~0.0001 * gNumerical = 0.000003 per step
// Ratio for velocity: 0.01 / 0.0001 = 100
// Ratio for v² (used in KE): 100² = 10000
const SPRING_VELOCITY_SQ_SCALE = 10000;

// State arrays
let count = 0;
let p1x, p1y, p2x, p2y;
let v1x, v1y, v2x, v2y;
let theta1, theta2, omega1, omega2;

// Grid info
let cols = 0;
let rows = 0;
const GRID_CELL_SIZE = 32;

let neighbourDeltas;
let totalNeighbourDelta = 0;

// Zoom state
let viewMinT1 = -Math.PI;
let viewMaxT1 = Math.PI;
let viewMinT2 = -Math.PI;
let viewMaxT2 = Math.PI;
let isZooming = false;
let isDragging = false;
let lastDragX = 0;
let lastDragY = 0;
let zoomTimer = null;
let zoomSnapshot = null;
let zoomSnapshotBounds = null;

// Catch-up state
let isCatchingUp = false;
let catchUpCursor = 0;
let catchUpBatchSize = 0;

// Graphics buffers
let imageData;
let buf32;

// Workers
let workers = [];
let workerCount = navigator.hardwareConcurrency || 4;
let pendingWorkers = 0;
let isSimulating = false;
let currentStepMaxDuration = 0;

// Worker URL - created from inline script (for file:// protocol compatibility)
const workerBlob = new Blob([document.getElementById('worker-script').textContent], { type: "text/javascript" });
const workerUrl = URL.createObjectURL(workerBlob);

// Debug stats
let lastSimTime = 0;
let lastRenderTime = 0;

