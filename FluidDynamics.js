const canvas = document.getElementById('gridCanvas');
const ctx = canvas.getContext('2d');

const GRID_SIZE = 121;//121

// Relaxation parameter (1.0 = normal Jacobi, >1.0 = over-relaxation for faster convergence)
let overrelaxation = 1.0;
let relaxIterations = 2;
let flowStrength = 2.0;

// Global time step for advection
let timeDelta = 1.34;

// Visualization flags
let showDivergence = false;
let showArrows = true;
let showGridLines = true;
let enableFlow = true;
let windtunnel = false;
let useGPU = true;
let enableAdvection = true;
let velocityCsvPending = false;

// Circle position (draggable)
let circleX = GRID_SIZE / 4;
let circleY = GRID_SIZE / 2;
let circleRadius = GRID_SIZE * 0.1;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Edge velocity arrays
// u: horizontal velocities at vertical edges (21 x 20 grid)
// Stored as 1D array: index = i + j * 21, where i is x-position (0-20), j is y-position (0-19)
const u = new Float64Array((GRID_SIZE + 1) * GRID_SIZE);

// v: vertical velocities at horizontal edges (20 x 21 grid)
// Stored as 1D array: index = i + j * 20, where i is x-position (0-19), j is y-position (0-20)
const v = new Float64Array(GRID_SIZE * (GRID_SIZE + 1));

// New velocity arrays for advection calculations
const uNew = new Float64Array((GRID_SIZE + 1) * GRID_SIZE);
const vNew = new Float64Array(GRID_SIZE * (GRID_SIZE + 1));

// cellDivergence: divergence for each cell (20 x 20 grid)
// Stored as 1D array: index = i + j * 20, where i is x-position (0-19), j is y-position (0-19)
const cellDivergence = new Float64Array(GRID_SIZE * GRID_SIZE);

// GPU acceleration state for relaxation (initialized on first use)
let relaxGpuState = null;

// cellSolid: whether each cell is solid (20 x 20 grid)
// Stored as 1D array: index = i + j * 20, where i is x-position (0-19), j is y-position (0-19)
const cellSolid = new Uint8Array(GRID_SIZE * GRID_SIZE);

// cellNeighborSolid: 5-bit value indicating solid state of neighbors and cell itself
// Bit 0: left neighbor, Bit 1: right neighbor, Bit 2: bottom neighbor, Bit 3: top neighbor, Bit 4: cell itself
// Stored as 1D array: index = i + j * GRID_SIZE
const cellNeighborSolid = new Uint8Array(GRID_SIZE * GRID_SIZE);

// Helper functions to access 2D indices in 1D arrays
function getU(i, j) {
	return u[i + j * (GRID_SIZE + 1)];
}

function setU(i, j, value) {
	u[i + j * (GRID_SIZE + 1)] = value;
}

function getV(i, j) {
	return v[i + j * GRID_SIZE];
}

function setV(i, j, value) {
	v[i + j * GRID_SIZE] = value;
}

function getDivergence(i, j) {
	return cellDivergence[i + j * GRID_SIZE];
}

function setDivergence(i, j, value) {
	cellDivergence[i + j * GRID_SIZE] = value;
}

function isSolid(i, j) {
	return cellSolid[i + j * GRID_SIZE] === 1;
}

function setSolid(i, j, value) {
	cellSolid[i + j * GRID_SIZE] = value ? 1 : 0;
}

function getNeighborSolid(i, j) {
	return cellNeighborSolid[i + j * GRID_SIZE];
}

function setNeighborSolid(i, j, value) {
	cellNeighborSolid[i + j * GRID_SIZE] = value;
}

function downloadVelocityCSV(beforeU, beforeV, cpuU, cpuV, gpuU, gpuV) {
	const format = (arr, idx) => (arr && idx < arr.length) ? arr[idx] : '';
	const maxLen = Math.max(
		beforeU.length,
		beforeV.length,
		cpuU.length,
		cpuV.length,
		gpuU.length,
		gpuV.length
	);
	let csv = 'beforeU,beforeV,cpuU,cpuV,gpuU,gpuV\n';
	for (let i = 0; i < maxLen; i++) {
		csv += [
			format(beforeU, i),
			format(beforeV, i),
			format(cpuU, i),
			format(cpuV, i),
			format(gpuU, i),
			format(gpuV, i)
		].join(',') + '\n';
	}
	const blob = new Blob([csv], { type: 'text/csv' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = 'velocity_debug.csv';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

// Helper functions for new velocity arrays
function getNewU(i, j) {
	return uNew[i + j * (GRID_SIZE + 1)];
}

function setNewU(i, j, value) {
	uNew[i + j * (GRID_SIZE + 1)] = value;
}

function getNewV(i, j) {
	return vNew[i + j * GRID_SIZE];
}

function setNewV(i, j, value) {
	vNew[i + j * GRID_SIZE] = value;
}

// Get interpolated velocity at floating point position (x, y)
// x, y are in grid coordinates (0 to GRID_SIZE)
// Returns {u, v} object with horizontal and vertical velocities
function GetVelocityInterpolated(x, y) {
	// Clamp coordinates to valid range
	x = Math.max(0, Math.min(GRID_SIZE, x));
	y = Math.max(0, Math.min(GRID_SIZE, y));

	// Interpolate U velocity (horizontal)
	// U velocities are at integer x positions, half-integer y positions (i, j+0.5)
	// So for point (x, y), we need to sample from u array
	const uX = x; // U is at integer x positions
	const uY = y - 0.5; // U is at half-integer y positions

	// Find surrounding grid points for U
	const uI = Math.floor(uX);
	const uJ = Math.floor(uY);

	// Bilinear interpolation weights
	const uFracX = uX - uI;
	const uFracY = uY - uJ;

	// Clamp indices to valid range
	const uI0 = Math.max(0, Math.min(GRID_SIZE, uI));
	const uI1 = Math.max(0, Math.min(GRID_SIZE, uI + 1));
	const uJ0 = Math.max(0, Math.min(GRID_SIZE - 1, uJ));
	const uJ1 = Math.max(0, Math.min(GRID_SIZE - 1, uJ + 1));

	// Sample U at four corners
	const u00 = getU(uI0, uJ0);
	const u10 = getU(uI1, uJ0);
	const u01 = getU(uI0, uJ1);
	const u11 = getU(uI1, uJ1);

	// Bilinear interpolation
	const uBottom = u00 * (1 - uFracX) + u10 * uFracX;
	const uTop = u01 * (1 - uFracX) + u11 * uFracX;
	const uVel = uBottom * (1 - uFracY) + uTop * uFracY;

	// Interpolate V velocity (vertical)
	// V velocities are at half-integer x positions, integer y positions (i+0.5, j)
	const vX = x - 0.5; // V is at half-integer x positions
	const vY = y; // V is at integer y positions

	// Find surrounding grid points for V
	const vI = Math.floor(vX);
	const vJ = Math.floor(vY);

	// Bilinear interpolation weights
	const vFracX = vX - vI;
	const vFracY = vY - vJ;

	// Clamp indices to valid range
	const vI0 = Math.max(0, Math.min(GRID_SIZE - 1, vI));
	const vI1 = Math.max(0, Math.min(GRID_SIZE - 1, vI + 1));
	const vJ0 = Math.max(0, Math.min(GRID_SIZE, vJ));
	const vJ1 = Math.max(0, Math.min(GRID_SIZE, vJ + 1));

	// Sample V at four corners
	const v00 = getV(vI0, vJ0);
	const v10 = getV(vI1, vJ0);
	const v01 = getV(vI0, vJ1);
	const v11 = getV(vI1, vJ1);

	// Bilinear interpolation
	const vBottom = v00 * (1 - vFracX) + v10 * vFracX;
	const vTop = v01 * (1 - vFracX) + v11 * vFracX;
	const vVel = vBottom * (1 - vFracY) + vTop * vFracY;

	return { u: uVel, v: vVel };
}

// Initialize solid cells (edge cells and center circle)
function initializeSolidCells() {
	for (let j = 0; j < GRID_SIZE; j++) {
		for (let i = 0; i < GRID_SIZE; i++) {
			// Set edge cells as solid, but skip right edge if windtunnel is on
			if (i === 0 || (!windtunnel && i === GRID_SIZE - 1) || j === 0 || j === GRID_SIZE - 1) {
				setSolid(i, j, true);
			} else {
				const dx = i - circleX;
				const dy = j - circleY;
				const distance = Math.sqrt(dx * dx + dy * dy);
				setSolid(i, j, distance <= circleRadius);
			}
		}
	}

	// Compute neighbor solid state bits for each cell
	for (let j = 0; j < GRID_SIZE; j++) {
		for (let i = 0; i < GRID_SIZE; i++) {
			let neighborBits = 0;
			
			// Bit 0: left neighbor is solid
			if (i > 0 && isSolid(i - 1, j)) {
				neighborBits |= 0x1;
			}
			
			// Bit 1: right neighbor is solid
			if (i < GRID_SIZE - 1 && isSolid(i + 1, j)) {
				neighborBits |= 0x2;
			}
			
			// Bit 2: bottom neighbor is solid
			if (j > 0 && isSolid(i, j - 1)) {
				neighborBits |= 0x4;
			}
			
			// Bit 3: top neighbor is solid
			if (j < GRID_SIZE - 1 && isSolid(i, j + 1)) {
				neighborBits |= 0x8;
			}
			
			// Bit 4: cell itself is solid
			if (isSolid(i, j)) {
				neighborBits |= 0x10;
			}
			
			setNeighborSolid(i, j, neighborBits);
		}
	}
}

// Calculate divergence for each cell
function CalculateDivergence() {
	for (let j = 0; j < GRID_SIZE; j++) {
		for (let i = 0; i < GRID_SIZE; i++) {
			const horizontalDelta = getU(i + 1, j) - getU(i, j);
			const verticalDelta = getV(i, j + 1) - getV(i, j);
			const divergence = horizontalDelta + verticalDelta;
			setDivergence(i, j, divergence);
		}
	}
}

// Zero out edge velocities for solid cells
function ZeroSolidVelocities() {
	for (let j = 0; j < GRID_SIZE; j++) {
		for (let i = 0; i < GRID_SIZE; i++) {
			if (isSolid(i, j)) {
				setU(i, j, 0);
				setU(i + 1, j, 0);
				setV(i, j, 0);
				setV(i, j + 1, 0);
			}
		}
	}
}

// Relax step: redistribute divergence across edge velocities
function RelaxStep(iterations = 1) {
	for (let iter = 0; iter < iterations; iter++) {
		setStaticFlow();

		const alternate = iter%2;

		for (let j = 0; j < GRID_SIZE; j++) {
			for (let i = 0; i < GRID_SIZE; i++) {
				if ((i+j)%2 == alternate) continue;
				
				const neighborBits = getNeighborSolid(i, j);
				if ((neighborBits & 0x10) !== 0) continue; // Cell itself is solid

				const horizontalDelta = getU(i + 1, j) - getU(i, j);
				const verticalDelta = getV(i, j + 1) - getV(i, j);
				const divergence = horizontalDelta + verticalDelta;
				const leftIsFluid = (neighborBits & 0x1) === 0;
				const rightIsFluid = (neighborBits & 0x2) === 0;
				const bottomIsFluid = (neighborBits & 0x4) === 0;
				const topIsFluid = (neighborBits & 0x8) === 0;

				let fluidNeighbors = 0;
				if (leftIsFluid) fluidNeighbors++;
				if (rightIsFluid) fluidNeighbors++;
				if (bottomIsFluid) fluidNeighbors++;
				if (topIsFluid) fluidNeighbors++;

				if (fluidNeighbors === 0) continue;

				const correction = (divergence / fluidNeighbors) * overrelaxation;

				if (rightIsFluid) {
					setU(i + 1, j, getU(i + 1, j) - correction);
				}
				if (leftIsFluid) {
					setU(i, j, getU(i, j) + correction);
				}
				if (topIsFluid) {
					setV(i, j + 1, getV(i, j + 1) - correction);
				}
				if (bottomIsFluid) {
					setV(i, j, getV(i, j) + correction);
				}
				//setU(i, j, iter);
				//setV(i, j, iter);
			}
		}
	}
}

async function ensureRelaxGpuState() {
	if (relaxGpuState !== null) {
		return relaxGpuState;
	}

	if (!('gpu' in navigator)) {
		console.warn('WebGPU not available - falling back to CPU relaxation');
		return null;
	}

	try {
		const adapter = await navigator.gpu.requestAdapter();
		if (!adapter) {
			console.warn('WebGPU adapter unavailable - falling back to CPU relaxation');
			return null;
		}

		const device = await adapter.requestDevice();

		const uLength = u.length;
		const vLength = v.length;
		const cellCount = cellNeighborSolid.length;

		const floatByteLength = 4;

		const uBuffer = device.createBuffer({
			size: uLength * floatByteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
		});

		const vBuffer = device.createBuffer({
			size: vLength * floatByteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
		});

		const neighborSolidBuffer = device.createBuffer({
			size: cellCount * Uint32Array.BYTES_PER_ELEMENT,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
		});

		const paramsBuffer = device.createBuffer({
			size: 8 * Float32Array.BYTES_PER_ELEMENT,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
		});

		const uReadBuffer = device.createBuffer({
			size: uLength * floatByteLength,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
		});

		const vReadBuffer = device.createBuffer({
			size: vLength * floatByteLength,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
		});

		const staticFlowModule = device.createShaderModule({
			label: 'StaticFlowModule',
			code: `
				struct Params {
					gridSize : u32,
					uWidth : u32,
					vWidth : u32,
					padding : u32,
					overrelaxation : f32,
					flowStrength : f32,
					enableFlow : f32,
					windtunnel : f32
				};

				@group(0) @binding(0) var<storage, read_write> uBuffer : array<f32>;
				@group(0) @binding(1) var<storage, read> params : Params;

				const WORKGROUP_SIZE : u32 = 128u;

				fn getUIndex(i : u32, j : u32, uWidth : u32) -> u32 {
					return i + j * uWidth;
				}

				@compute @workgroup_size(WORKGROUP_SIZE)
				fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
					let gridSize = params.gridSize;
					let uWidth = params.uWidth;
					let j = global_id.x;
					
					if (j >= gridSize) {
						return;
					}

					let flowStrength = params.flowStrength;
					let enableFlow = params.enableFlow > 0.5;
					let windtunnel = params.windtunnel > 0.5;

					let middleRow = gridSize / 2u;
					let sideFlowStrength = flowStrength * 0.5;
					let delta = flowStrength * 0.2;

					if (windtunnel) {
						let inletIdx = getUIndex(1u, j, uWidth);
						uBuffer[inletIdx] = delta;
					}

					if (enableFlow) {
						var inletStrength = flowStrength;
						var inletSideStrength = sideFlowStrength;
						if (windtunnel) {
							inletStrength = inletStrength + delta;
							inletSideStrength = inletSideStrength + delta;
						}

						if (j == middleRow) {
							let inletIdx = getUIndex(1u, middleRow, uWidth);
							uBuffer[inletIdx] = inletStrength;

							if (!windtunnel) {
								let outletIdx = getUIndex(gridSize - 1u, middleRow, uWidth);
								uBuffer[outletIdx] = flowStrength;
							}
						}

						if (middleRow > 0u && j == middleRow - 1u) {
							let idx = getUIndex(1u, middleRow - 1u, uWidth);
							uBuffer[idx] = inletSideStrength;
						}

						if (middleRow + 1u < gridSize && j == middleRow + 1u) {
							let idx = getUIndex(1u, middleRow + 1u, uWidth);
							uBuffer[idx] = inletSideStrength;
						}
					}
				}
			`
		});

		const relaxModule = device.createShaderModule({
			label: 'RelaxStepSkeletonModule',
			code: `
				struct Params {
					gridSize : u32,
					uWidth : u32,
					vWidth : u32,
					padding : u32,
					overrelaxation : f32,
					pad0 : f32,
					pad1 : f32,
					pad2 : f32
				};

				@group(0) @binding(0) var<storage, read_write> uBuffer : array<f32>;
				@group(0) @binding(1) var<storage, read_write> vBuffer : array<f32>;
				@group(0) @binding(2) var<storage, read> neighborSolidInput : array<u32>;
				@group(0) @binding(3) var<storage, read> params : Params;

				const WORKGROUP_SIZE : u32 = 128u;

				fn getCellIndex(i : u32, j : u32, gridSize : u32) -> u32 {
					return i + j * gridSize;
				}

				fn getUIndex(i : u32, j : u32, uWidth : u32) -> u32 {
					return i + j * uWidth;
				}

				fn getVIndex(i : u32, j : u32, vWidth : u32) -> u32 {
					return i + j * vWidth;
				}

				@compute @workgroup_size(WORKGROUP_SIZE)
				fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
					let gridSize = params.gridSize;
					let uWidth = params.uWidth;
					let vWidth = params.vWidth;

					let cellIndex = global_id.x;
					if (cellIndex >= gridSize * gridSize) {
						return;
					}

					let i = cellIndex % gridSize;
					let j = cellIndex / gridSize;

					let paritySkip = params.padding;
					if (((i + j) & 1u) == paritySkip) {
						return;
					}

					let neighborBits = neighborSolidInput[cellIndex];
					
					// Bit 4: cell itself is solid
					if ((neighborBits & 0x10u) != 0u) {
						return;
					}

					// Bit 0: left neighbor is solid, Bit 1: right neighbor is solid
					// Bit 2: bottom neighbor is solid, Bit 3: top neighbor is solid
					let leftIsFluid = (neighborBits & 0x1u) == 0u;
					let rightIsFluid = (neighborBits & 0x2u) == 0u;
					let bottomIsFluid = (neighborBits & 0x4u) == 0u;
					let topIsFluid = (neighborBits & 0x8u) == 0u;

					var fluidNeighbors : u32 = 0u;
					if (leftIsFluid) { fluidNeighbors += 1u; }
					if (rightIsFluid) { fluidNeighbors += 1u; }
					if (bottomIsFluid) { fluidNeighbors += 1u; }
					if (topIsFluid) { fluidNeighbors += 1u; }

					if (fluidNeighbors == 0u) {
						return;
					}

					let uLeftIndex = getUIndex(i, j, uWidth);
					let uRightIndex = getUIndex(i + 1u, j, uWidth);
					let vBottomIndex = getVIndex(i, j, vWidth);
					let vTopIndex = getVIndex(i, j + 1u, vWidth);

					let uLeft = uBuffer[uLeftIndex];
					let uRight = uBuffer[uRightIndex];
					let vBottom = vBuffer[vBottomIndex];
					let vTop = vBuffer[vTopIndex];

					let horizontalDelta = uRight - uLeft;
					let verticalDelta = vTop - vBottom;
					let divergence = horizontalDelta + verticalDelta;

					let correction = divergence / f32(fluidNeighbors) * params.overrelaxation;

					if (rightIsFluid) {
						uBuffer[uRightIndex] = uRight - correction;
					}
					if (leftIsFluid) {
						uBuffer[uLeftIndex] = uLeft + correction;
					}
					if (topIsFluid) {
						vBuffer[vTopIndex] = vTop - correction;
					}
					if (bottomIsFluid) {
						vBuffer[vBottomIndex] = vBottom + correction;
					}
//					uBuffer[getUIndex(i, j, uWidth)] = f32(paritySkip);//f32(i);
//					vBuffer[getVIndex(i, j, vWidth)] = f32(paritySkip);//f32(j);
				}
			`
		});

		const staticFlowPipeline = device.createComputePipeline({
			layout: 'auto',
			compute: {
				module: staticFlowModule,
				entryPoint: 'main'
			}
		});

		const pipeline = device.createComputePipeline({
			layout: 'auto',
			compute: {
				module: relaxModule,
				entryPoint: 'main'
			}
		});

		const uUpload = new Float32Array(uLength);
		const vUpload = new Float32Array(vLength);
		const neighborSolidUpload = new Uint32Array(cellCount);
		const paramsUint = new Uint32Array(8);
		const paramsFloat = new Float32Array(paramsUint.buffer);

		const gpuState = {
			device,
			uBuffer,
			vBuffer,
			neighborSolidBuffer,
			paramsBuffer,
			uReadBuffer,
			vReadBuffer,
			staticFlowPipeline,
			pipeline,
			uUpload,
			vUpload,
			neighborSolidUpload,
			paramsUint,
			paramsFloat,
			cellCount,
			uLength,
			vLength,
			readBufferSupported: typeof device.queue.readBuffer === 'function'
		};

		relaxGpuState = gpuState;
		return gpuState;
	} catch (error) {
		console.error('Failed to initialize WebGPU relaxation pipeline:', error);
		return null;
	}
}

async function RelaxStepGPU(iterations = 1) {
	const state = await ensureRelaxGpuState();
	if (!state) {
		RelaxStep(iterations);
		return;
	}

	const { device } = state;

	// Neighbor solid bits are static for a given geometry; upload once.
	for (let idx = 0; idx < cellNeighborSolid.length; idx++) {
		state.neighborSolidUpload[idx] = cellNeighborSolid[idx];
	}
	device.queue.writeBuffer(state.neighborSolidBuffer, 0, state.neighborSolidUpload);

	// Upload initial velocities once; subsequent iterations run entirely on GPU.
	state.uUpload.set(u);
	state.vUpload.set(v);
	device.queue.writeBuffer(state.uBuffer, 0, state.uUpload);
	device.queue.writeBuffer(state.vBuffer, 0, state.vUpload);

	const staticFlowBindGroup = device.createBindGroup({
		layout: state.staticFlowPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: state.uBuffer } },
			{ binding: 1, resource: { buffer: state.paramsBuffer } }
		]
	});

	const relaxBindGroup = device.createBindGroup({
		layout: state.pipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: state.uBuffer } },
			{ binding: 1, resource: { buffer: state.vBuffer } },
			{ binding: 2, resource: { buffer: state.neighborSolidBuffer } },
			{ binding: 3, resource: { buffer: state.paramsBuffer } }
		]
	});

	const staticFlowWorkgroups = Math.ceil(GRID_SIZE / 128);
	const relaxWorkgroups = Math.ceil(state.cellCount / 128);

	for (let iter = 0; iter < iterations; iter++) {
		// Update params for this iteration (parity + overrelaxation + static flow params).
		state.paramsUint.fill(0);
		state.paramsUint[0] = GRID_SIZE;
		state.paramsUint[1] = GRID_SIZE + 1;
		state.paramsUint[2] = GRID_SIZE;
		state.paramsUint[3] = iter % 2;
		state.paramsFloat[4] = Math.fround(overrelaxation);
		state.paramsFloat[5] = Math.fround(flowStrength);
		state.paramsFloat[6] = enableFlow ? 1.0 : 0.0;
		state.paramsFloat[7] = windtunnel ? 1.0 : 0.0;
		device.queue.writeBuffer(state.paramsBuffer, 0, state.paramsUint);

		const commandEncoder = device.createCommandEncoder();

		// Pass 1: Apply static flow (inlet/outlet boundaries)
		const staticFlowPass = commandEncoder.beginComputePass();
		staticFlowPass.setPipeline(state.staticFlowPipeline);
		staticFlowPass.setBindGroup(0, staticFlowBindGroup);
		staticFlowPass.dispatchWorkgroups(staticFlowWorkgroups);
		staticFlowPass.end();

		// Pass 2: Relaxation step (divergence correction)
		const relaxPass = commandEncoder.beginComputePass();
		relaxPass.setPipeline(state.pipeline);
		relaxPass.setBindGroup(0, relaxBindGroup);
		relaxPass.dispatchWorkgroups(relaxWorkgroups);
		relaxPass.end();

		device.queue.submit([commandEncoder.finish()]);
	}

	// After all iterations, copy results back once.
	const finalEncoder = device.createCommandEncoder();
	if (!state.readBufferSupported) {
		finalEncoder.copyBufferToBuffer(state.uBuffer, 0, state.uReadBuffer, 0, state.uLength * 4);
		finalEncoder.copyBufferToBuffer(state.vBuffer, 0, state.vReadBuffer, 0, state.vLength * 4);
	}
	device.queue.submit([finalEncoder.finish()]);
	await device.queue.onSubmittedWorkDone();

	let uResult;
	let vResult;

	if (state.readBufferSupported) {
		const uResultBuffer = await device.queue.readBuffer(state.uBuffer, 0, state.uLength * 4);
		const vResultBuffer = await device.queue.readBuffer(state.vBuffer, 0, state.vLength * 4);
		uResult = new Float32Array(uResultBuffer);
		vResult = new Float32Array(vResultBuffer);
	} else {
		await state.uReadBuffer.mapAsync(GPUMapMode.READ);
		const uMapped = state.uReadBuffer.getMappedRange().slice(0);
		state.uReadBuffer.unmap();

		await state.vReadBuffer.mapAsync(GPUMapMode.READ);
		const vMapped = state.vReadBuffer.getMappedRange().slice(0);
		state.vReadBuffer.unmap();

		uResult = new Float32Array(uMapped);
		vResult = new Float32Array(vMapped);
	}

	for (let idx = 0; idx < u.length; idx++) {
		u[idx] = uResult[idx];
	}
	for (let idx = 0; idx < v.length; idx++) {
		v[idx] = vResult[idx];
	}
}

// Advection: transport velocity values along the flow field
function Advection() {
	for (let j = 0; j < GRID_SIZE; j++) {
		for (let i = 0; i <= GRID_SIZE; i++) {
			const x = i;
			const y = j + 0.5;
			const vel = GetVelocityInterpolated(x, y);
			const backX = x - vel.u * timeDelta;
			const backY = y - vel.v * timeDelta;
			const backVel = GetVelocityInterpolated(backX, backY);
			setNewU(i, j, backVel.u);
		}
	}

	for (let j = 0; j <= GRID_SIZE; j++) {
		for (let i = 0; i < GRID_SIZE; i++) {
			const x = i + 0.5;
			const y = j;
			const vel = GetVelocityInterpolated(x, y);
			const backX = x - vel.u * timeDelta;
			const backY = y - vel.v * timeDelta;
			const backVel = GetVelocityInterpolated(backX, backY);
			setNewV(i, j, backVel.v);
		}
	}

	for (let j = 0; j < GRID_SIZE; j++) {
		for (let i = 0; i <= GRID_SIZE; i++) {
			setU(i, j, getNewU(i, j));
		}
	}

	for (let j = 0; j <= GRID_SIZE; j++) {
		for (let i = 0; i < GRID_SIZE; i++) {
			setV(i, j, getNewV(i, j));
		}
	}
}

// Initialize some test velocities
function initializeVelocities() {
	for (let j = 0; j < GRID_SIZE; j++) {
		for (let i = 0; i <= GRID_SIZE; i++) {
			const centerX = GRID_SIZE / 2;
			const centerY = GRID_SIZE / 2;
			const dx = i - centerX;
			const dy = j + 0.5 - centerY;
			setU(i, j, -dy * 0.3);
		}
	}

	for (let j = 0; j <= GRID_SIZE; j++) {
		for (let i = 0; i < GRID_SIZE; i++) {
			const centerX = GRID_SIZE / 2;
			const centerY = GRID_SIZE / 2;
			const dx = i + 0.5 - centerX;
			const dy = j - centerY;
			setV(i, j, dx * 0.3);
		}
	}
	ZeroSolidVelocities();
}

// Randomize velocities
function randomizeVelocities() {
	for (let j = 0; j < GRID_SIZE; j++) {
		for (let i = 0; i <= GRID_SIZE; i++) {
			setU(i, j, (Math.random() - 0.5) * 5);
		}
	}

	for (let j = 0; j <= GRID_SIZE; j++) {
		for (let i = 0; i < GRID_SIZE; i++) {
			setV(i, j, (Math.random() - 0.5) * 5);
		}
	}
	ZeroSolidVelocities();
}

// Draw an arrow
function drawArrow(x, y, dx, dy, scale) {
	const magnitude = Math.sqrt(dx * dx + dy * dy);
	if (magnitude < 0.01) return;

	const arrowLength = magnitude * scale;
	const headLength = Math.min(arrowLength * 0.3, scale * 0.3);
	const headWidth = headLength * 1.5;

	const nx = dx / magnitude;
	const ny = dy / magnitude;

	const endX = x + nx * arrowLength;
	const endY = y + ny * arrowLength;

	ctx.beginPath();
	ctx.moveTo(x, y);
	ctx.lineTo(endX, endY);
	ctx.stroke();

	const perpX = -ny;
	const perpY = nx;

	ctx.beginPath();
	ctx.moveTo(endX, endY);
	ctx.lineTo(endX - nx * headLength + perpX * headWidth,
		endY - ny * headLength + perpY * headWidth);
	ctx.lineTo(endX - nx * headLength - perpX * headWidth,
		endY - ny * headLength - perpY * headWidth);
	ctx.closePath();
	ctx.fill();
}

// Convert HSV to RGB
function hsvToRgb(h, s, v) {
	h = h % 360;
	const c = v * s;
	const x = c * (1 - Math.abs((h / 60) % 2 - 1));
	const m = v - c;

	let r, g, b;
	if (h < 60) {
		r = c; g = x; b = 0;
	} else if (h < 120) {
		r = x; g = c; b = 0;
	} else if (h < 180) {
		r = 0; g = c; b = x;
	} else if (h < 240) {
		r = 0; g = x; b = c;
	} else if (h < 300) {
		r = x; g = 0; b = c;
	} else {
		r = c; g = 0; b = x;
	}

	return {
		r: Math.floor((r + m) * 255),
		g: Math.floor((g + m) * 255),
		b: Math.floor((b + m) * 255)
	};
}

// Draw velocity field visualization using HSV color space (fast with pre-calculated colors)
function drawVelocityField() {
	const cellSize = canvas.width / GRID_SIZE;

	const imageData = ctx.createImageData(canvas.width, canvas.height);
	const data = imageData.data;

	const sampleRate = 4;
	const sampleWidth = Math.ceil(canvas.width / sampleRate);
	const sampleHeight = Math.ceil(canvas.height / sampleRate);

	const sampleColors = [];
	for (let sy = 0; sy < sampleHeight; sy++) {
		const row = [];
		for (let sx = 0; sx < sampleWidth; sx++) {
			const gridX = (sx * sampleRate / canvas.width) * GRID_SIZE;
			const gridY = (sy * sampleRate / canvas.height) * GRID_SIZE;

			const i = Math.floor(gridX);
			const j = Math.floor(gridY);

			const solidCell = (i >= 0 && i < GRID_SIZE && j >= 0 && j < GRID_SIZE) && isSolid(i, j);

			if (solidCell) {
				row.push({ r: 51, g: 51, b: 51 });
			} else {
				const uLeft = getU(i, j);
				const uRight = getU(i + 1, j);
				const vBottom = getV(i, j);
				const vTop = getV(i, j + 1);

				const uVel = (uLeft + uRight) * 0.5;
				const vVel = (vBottom + vTop) * 0.5;

				const magnitude = Math.sqrt(uVel * uVel + vVel * vVel);

				const maxMagnitude = 1.0;
				const normalizedMagnitude = Math.min(1.0, magnitude / maxMagnitude);

				let r, g, b;
				if (normalizedMagnitude < 0.33) {
					const t = normalizedMagnitude / 0.33;
					r = 0;
					g = 0;
					b = Math.floor(t * 139);
				} else if (normalizedMagnitude < 0.66) {
					const t = (normalizedMagnitude - 0.33) / 0.33;
					r = Math.floor(t * 173);
					g = Math.floor(t * 216);
					b = Math.floor(139 + t * (230 - 139));
				} else {
					const t = (normalizedMagnitude - 0.66) / 0.34;
					r = Math.floor(173 + t * (255 - 173));
					g = Math.floor(216 + t * (255 - 216));
					b = Math.floor(230 + t * (255 - 230));
				}

				row.push({ r: r, g: g, b: b });
			}
		}
		sampleColors.push(row);
	}

	for (let py = 0; py < canvas.height; py++) {
		for (let px = 0; px < canvas.width; px++) {
			const pixelIndex = (py * canvas.width + px) * 4;
			const sx = Math.min(Math.floor(px / sampleRate), sampleWidth - 1);
			const sy = Math.min(Math.floor(py / sampleRate), sampleHeight - 1);
			const color = sampleColors[sy][sx];

			data[pixelIndex + 0] = color.r;
			data[pixelIndex + 1] = color.g;
			data[pixelIndex + 2] = color.b;
			data[pixelIndex + 3] = 255;
		}
	}

	ctx.putImageData(imageData, 0, 0);
}

function resizeCanvas() {
	const maxWidth = window.innerWidth * 0.95;
	const maxHeight = window.innerHeight * 0.95;
	const size = Math.min(maxWidth, maxHeight);

	canvas.width = size;
	canvas.height = size;
}

function drawGrid() {
	const cellSize = canvas.width / GRID_SIZE;

	ctx.fillStyle = 'black';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	if (showDivergence) {
		for (let j = 0; j < GRID_SIZE; j++) {
			for (let i = 0; i < GRID_SIZE; i++) {
				let r, g, b;
				if (isSolid(i, j)) {
					r = 51; g = 51; b = 51;
				} else {
					const divergence = getDivergence(i, j);
					const scale = 0.5;
					const normalizedDiv = Math.max(-1, Math.min(1, divergence * scale));
					if (normalizedDiv > 0) { r = 0; g = Math.floor(normalizedDiv * 255); b = 0; }
					else { r = Math.floor(-normalizedDiv * 255); g = 0; b = 0; }
				}
				ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
				ctx.fillRect(i * cellSize, j * cellSize, cellSize, cellSize);
			}
		}
	} else {
		drawVelocityField();
	}

	if (showGridLines) {
		ctx.strokeStyle = 'white';
		ctx.lineWidth = 1;
		for (let i = 0; i <= GRID_SIZE; i++) {
			const x = i * cellSize;
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, canvas.height);
			ctx.stroke();
		}
		for (let i = 0; i <= GRID_SIZE; i++) {
			const y = i * cellSize;
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(canvas.width, y);
			ctx.stroke();
		}
	}

	if (showArrows) {
		ctx.strokeStyle = '#00ff00';
		ctx.fillStyle = '#00ff00';
		ctx.lineWidth = 1.5;
		const arrowScale = 10;
		for (let j = 0; j < GRID_SIZE; j++) {
			for (let i = 0; i <= GRID_SIZE; i++) {
				const x = i * cellSize;
				const y = (j + 0.5) * cellSize;
				const velocity = getU(i, j);
				drawArrow(x, y, velocity, 0, arrowScale);
			}
		}
		for (let j = 0; j <= GRID_SIZE; j++) {
			for (let i = 0; i < GRID_SIZE; i++) {
				const x = (i + 0.5) * cellSize;
				const y = j * cellSize;
				const velocity = getV(i, j);
				drawArrow(x, y, 0, velocity, arrowScale);
			}
		}
	}
}

// Animation loop variables
let lastTime = 0;
let frameCount = 0;
let fpsLastTime = 0;
let currentFPS = 0;

// Set static flow sources in the simulation
function setStaticFlow() {
	const middleRow = Math.floor(GRID_SIZE / 2);
	const sideFlowStrength = flowStrength * 0.5;
	const delta = flowStrength * 0.2;

	if (windtunnel) {
		for (let j = 0; j < GRID_SIZE; j++) {
			setU(1, j, delta);
		}
	}

	if (enableFlow) {
		const inletStrength = flowStrength + (windtunnel ? delta : 0);
		const inletSideStrength = sideFlowStrength + (windtunnel ? delta : 0);

		setU(1, middleRow, inletStrength);
		if (middleRow > 0) {
			setU(1, middleRow - 1, inletSideStrength);
		}
		if (middleRow < GRID_SIZE - 1) {
			setU(1, middleRow + 1, inletSideStrength);
		}

		if (!windtunnel) {
			setU(GRID_SIZE - 1, middleRow, flowStrength);
		}
	}
}

// Update function - called every frame
async function update(deltaTime) {
	ZeroSolidVelocities();
	// setStaticFlow();
	if (useGPU) {
		const uBefore = Float64Array.from(u);
		const vBefore = Float64Array.from(v);

		RelaxStep(relaxIterations);
		const cpuU = Float64Array.from(u);
		const cpuV = Float64Array.from(v);

		u.set(uBefore);
		v.set(vBefore);

		await RelaxStepGPU(relaxIterations);
		const gpuU = Float64Array.from(u);
		const gpuV = Float64Array.from(v);

		if (velocityCsvPending) {
			downloadVelocityCSV(uBefore, vBefore, cpuU, cpuV, gpuU, gpuV);
			velocityCsvPending = false;
		}
	} else {
		RelaxStep(relaxIterations);
	}
	if (enableAdvection) {
		Advection();
	}
	CalculateDivergence();
}

// Animation loop
async function animate(currentTime) {
	const deltaTime = lastTime ? (currentTime - lastTime) / 1000 : 0;
	lastTime = currentTime;

	frameCount++;
	if (currentTime - fpsLastTime >= 1000) {
		currentFPS = frameCount * 1000 / (currentTime - fpsLastTime);
		frameCount = 0;
		fpsLastTime = currentTime;
		document.getElementById('fpsCounter').textContent = `FPS: ${currentFPS.toFixed(2)}`;
	}

	try {
		await update(deltaTime);
		drawGrid();
	} catch (error) {
		console.error('Simulation update failed', error);
	}
	requestAnimationFrame(animate);
}

// Initialize solid cells, velocities and start animation
initializeSolidCells();
initializeVelocities();
ZeroSolidVelocities();
resizeCanvas();
animate(0);

// Redraw on window resize
window.addEventListener('resize', resizeCanvas);

// Mouse event handlers for dragging the circle
canvas.addEventListener('mousedown', function(e) {
	const rect = canvas.getBoundingClientRect();
	const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
	const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

	const cellSize = canvas.width / GRID_SIZE;
	const gridX = mouseX / cellSize;
	const gridY = mouseY / cellSize;

	const dx = gridX - circleX;
	const dy = gridY - circleY;
	const distance = Math.sqrt(dx * dx + dy * dy);

	if (distance <= circleRadius + 2) {
		isDragging = true;
		dragOffsetX = dx;
		dragOffsetY = dy;
	}
});

canvas.addEventListener('mousemove', function(e) {
	if (isDragging) {
		const rect = canvas.getBoundingClientRect();
		const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
		const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

		const cellSize = canvas.width / GRID_SIZE;
		const gridX = mouseX / cellSize;
		const gridY = mouseY / cellSize;

		circleX = Math.max(circleRadius, Math.min(GRID_SIZE - circleRadius, gridX - dragOffsetX));
		circleY = Math.max(circleRadius, Math.min(GRID_SIZE - circleRadius, gridY - dragOffsetY));

		initializeSolidCells();
	}
});

canvas.addEventListener('mouseup', function() {
	isDragging = false;
});

canvas.addEventListener('mouseleave', function() {
	isDragging = false;
});

// Button event listeners
document.getElementById('randomizeBtn').addEventListener('click', randomizeVelocities);

document.getElementById('divergenceBtn').addEventListener('click', function() {
	showDivergence = !showDivergence;
	const btn = document.getElementById('divergenceBtn');
	btn.textContent = showDivergence ? 'Divergence: ON' : 'Divergence: OFF';
});

document.getElementById('arrowsBtn').addEventListener('click', function() {
	showArrows = !showArrows;
	const btn = document.getElementById('arrowsBtn');
	btn.textContent = showArrows ? 'Arrows: ON' : 'Arrows: OFF';
});

document.getElementById('gridLinesBtn').addEventListener('click', function() {
	showGridLines = !showGridLines;
	const btn = document.getElementById('gridLinesBtn');
	btn.textContent = showGridLines ? 'Grid Lines: ON' : 'Grid Lines: OFF';
});

document.getElementById('flowBtn').addEventListener('click', function() {
	enableFlow = !enableFlow;
	const btn = document.getElementById('flowBtn');
	btn.textContent = enableFlow ? 'Flow: ON' : 'Flow: OFF';
});

document.getElementById('windtunnelBtn').addEventListener('click', function() {
	windtunnel = !windtunnel;
	const btn = document.getElementById('windtunnelBtn');
	btn.textContent = windtunnel ? 'Windtunnel: ON' : 'Windtunnel: OFF';
	// Reinitialize solid cells to update right edge based on windtunnel state
	initializeSolidCells();
});

document.getElementById('gpuBtn').addEventListener('click', function() {
	useGPU = !useGPU;
	const btn = document.getElementById('gpuBtn');
	btn.textContent = useGPU ? 'GPU: ON' : 'GPU: OFF';
});

document.getElementById('velocityCsvBtn').addEventListener('click', function() {
	velocityCsvPending = true;
});

document.getElementById('enableAdvectionBtn').addEventListener('click', function() {
	enableAdvection = !enableAdvection;
	const btn = document.getElementById('enableAdvectionBtn');
	btn.textContent = enableAdvection ? 'Enable Advection: ON' : 'Enable Advection: OFF';
});

document.getElementById('relaxStepBtn').addEventListener('click', function() {
	CalculateDivergence();
	RelaxStep(relaxIterations);
	CalculateDivergence();
});

document.getElementById('advectionBtn').addEventListener('click', function() {
	Advection();
	CalculateDivergence();
});

document.getElementById('overrelaxInput').addEventListener('input', function(e) {
	overrelaxation = parseFloat(e.target.value);
	const lbl = document.getElementById('overrelaxVal');
	if (lbl) lbl.textContent = overrelaxation.toFixed(2);
});

document.getElementById('relaxIterInput').addEventListener('input', function(e) {
	relaxIterations = parseInt(e.target.value);
	const lbl = document.getElementById('relaxIterVal');
	if (lbl) lbl.textContent = String(relaxIterations);
});

document.getElementById('flowStrengthInput').addEventListener('input', function(e) {
	flowStrength = parseFloat(e.target.value);
	const lbl = document.getElementById('flowStrengthVal');
	if (lbl) lbl.textContent = flowStrength.toFixed(1);
});

document.getElementById('circleSizeInput').addEventListener('input', function(e) {
	const newSize = parseFloat(e.target.value);
	circleRadius = GRID_SIZE * newSize;
	const lbl = document.getElementById('circleSizeVal');
	if (lbl) lbl.textContent = newSize.toFixed(2);
	initializeSolidCells();
});

document.getElementById('timeStepInput').addEventListener('input', function(e) {
	timeDelta = parseFloat(e.target.value);
	const lbl = document.getElementById('timeStepVal');
	if (lbl) lbl.textContent = timeDelta.toFixed(2);
});


