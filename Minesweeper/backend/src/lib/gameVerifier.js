/**
 * Game Verifier - Replays and validates Minesweeper games
 * This ensures scores are legitimate by re-running the game server-side
 */

const { createSeededRng } = require('./seededRng');

// Game configuration (must match client)
const COLS = 30;
const ROWS = 16;
const MINES = 99;

/**
 * Verify a game replay is valid
 * @param {Object} gameData - The complete game data from client
 * @returns {Object} - { valid: boolean, reason?: string, verifiedTime?: number }
 */
function verifyGame(gameData) {
    const { seed, moves, finalTime, won } = gameData;
    
    // Validate basic structure
    if (!seed || !Array.isArray(moves) || typeof finalTime !== 'number') {
        return { valid: false, reason: 'Invalid game data structure' };
    }
    
    if (seed < 1 || seed > 999999) {
        return { valid: false, reason: 'Invalid seed value' };
    }
    
    // Initialize game state
    let grid = [];
    let revealed = [];
    let flagged = [];
    let gameOver = false;
    let firstClick = true;
    
    // Initialize arrays
    for (let row = 0; row < ROWS; row++) {
        grid[row] = [];
        revealed[row] = [];
        flagged[row] = [];
        for (let col = 0; col < COLS; col++) {
            grid[row][col] = 0;
            revealed[row][col] = false;
            flagged[row][col] = false;
        }
    }
    
    let lastTimestamp = -1;
    
    // Process each move
    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        const { type, r: row, c: col, t: timestamp } = move;
        
        // Validate timestamp is present and increasing (allow same timestamp)
        if (typeof timestamp !== 'number' || timestamp < lastTimestamp) {
            return { valid: false, reason: `Invalid timestamp at move ${i}` };
        }
        lastTimestamp = timestamp;
        
        // Skip non-grid moves (undo, hints)
        if (row === -1 && col === -1) {
            continue;
        }
        
        // Validate coordinates for grid moves
        if (row !== undefined && col !== undefined) {
            if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
                return { valid: false, reason: `Invalid coordinates at move ${i}: (${row}, ${col})` };
            }
        }
        
        switch (type) {
            case 'reveal':
                if (firstClick) {
                    firstClick = false;
                    placeMines(grid, seed, row, col);
                    calculateAdjacentCounts(grid);
                }
                
                if (revealed[row][col]) {
                    return { valid: false, reason: `Reveal on already revealed cell at move ${i}` };
                }
                
                if (flagged[row][col]) {
                    return { valid: false, reason: `Reveal on flagged cell at move ${i}` };
                }
                
                if (grid[row][col] === -1) {
                    gameOver = true;
                }
                
                revealCell(grid, revealed, flagged, row, col);
                break;
                
            case 'chord':
                if (!revealed[row][col]) {
                    return { valid: false, reason: `Chord on unrevealed cell at move ${i}` };
                }
                
                if (grid[row][col] <= 0) {
                    return { valid: false, reason: `Chord on non-number cell at move ${i}` };
                }
                
                // Count adjacent flags
                const adjFlags = countAdjacentFlags(flagged, row, col);
                
                // If flags match, reveal adjacent unflagged cells
                if (adjFlags === grid[row][col]) {
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const nr = row + dr, nc = col + dc;
                            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                                if (!revealed[nr][nc] && !flagged[nr][nc]) {
                                    if (grid[nr][nc] === -1) {
                                        gameOver = true;
                                    }
                                    revealCell(grid, revealed, flagged, nr, nc);
                                }
                            }
                        }
                    }
                }
                break;
                
            case 'flag':
                if (revealed[row][col]) {
                    return { valid: false, reason: `Flag on revealed cell at move ${i}` };
                }
                flagged[row][col] = true;
                break;
                
            case 'unflag':
                if (!flagged[row][col]) {
                    return { valid: false, reason: `Unflag on non-flagged cell at move ${i}` };
                }
                flagged[row][col] = false;
                break;
                
            case 'hint_d':
            case 'hint_e':
            case 'undo':
                // These are recorded for stats but don't affect verification
                // In a stricter mode, we could disallow hints from leaderboard
                break;
                
            default:
                return { valid: false, reason: `Unknown move type: ${type} at move ${i}` };
        }
        
        // If game ended (hit mine) but player claims win, that's invalid
        if (gameOver && won) {
            return { valid: false, reason: 'Claimed win but hit a mine' };
        }
    }
    
    // Check win condition
    if (won) {
        const revealedCount = countRevealed(revealed);
        const expectedRevealed = ROWS * COLS - MINES;
        
        if (revealedCount !== expectedRevealed) {
            return { 
                valid: false, 
                reason: `Win claimed but incorrect cells revealed (${revealedCount} vs ${expectedRevealed} expected)` 
            };
        }
        
        // Verify final time is reasonable (within 2 seconds of last move)
        const lastMoveTime = moves.length > 0 ? moves[moves.length - 1].t : 0;
        const timeDiff = Math.abs(finalTime - lastMoveTime);
        if (timeDiff > 5000) { // 5 second tolerance
            return { 
                valid: false, 
                reason: `Final time (${finalTime}ms) doesn't match last move (${lastMoveTime}ms)` 
            };
        }
    }
    
    return { 
        valid: true, 
        verifiedTime: finalTime,
        stats: {
            totalMoves: moves.length,
            hintsUsed: moves.filter(m => m.type === 'hint_d' || m.type === 'hint_e').length,
            undosUsed: moves.filter(m => m.type === 'undo').length
        }
    };
}

/**
 * Place mines using seeded RNG (must match client exactly)
 */
function placeMines(grid, seed, safeRow, safeCol) {
    const rng = createSeededRng(seed);
    
    const minePositions = [];
    let minesPlaced = 0;
    
    while (minesPlaced < MINES) {
        const row = Math.floor(rng() * ROWS);
        const col = Math.floor(rng() * COLS);
        const alreadyMined = minePositions.some(p => p.row === row && p.col === col);
        
        if (!alreadyMined) {
            minePositions.push({ row, col });
            minesPlaced++;
        }
    }
    
    // Place mines, moving any in the safe zone
    for (const pos of minePositions) {
        const isSafeZone = Math.abs(pos.row - safeRow) <= 1 && Math.abs(pos.col - safeCol) <= 1;
        
        if (isSafeZone) {
            // Find a new position outside safe zone
            let moved = false;
            for (let r = 0; r < ROWS && !moved; r++) {
                for (let c = 0; c < COLS && !moved; c++) {
                    const inSafe = Math.abs(r - safeRow) <= 1 && Math.abs(c - safeCol) <= 1;
                    if (!inSafe && grid[r][c] !== -1) {
                        grid[r][c] = -1;
                        moved = true;
                    }
                }
            }
        } else {
            grid[pos.row][pos.col] = -1;
        }
    }
}

/**
 * Calculate adjacent mine counts for all cells
 */
function calculateAdjacentCounts(grid) {
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            if (grid[row][col] === -1) continue;
            
            let count = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = row + dr, nc = col + dc;
                    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                        if (grid[nr][nc] === -1) count++;
                    }
                }
            }
            grid[row][col] = count;
        }
    }
}

/**
 * Reveal a cell with flood fill for empty cells
 */
function revealCell(grid, revealed, flagged, row, col) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
    if (revealed[row][col] || flagged[row][col]) return;
    
    revealed[row][col] = true;
    
    // Don't flood fill from mines
    if (grid[row][col] === -1) return;
    
    // Flood fill if empty cell
    if (grid[row][col] === 0) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                revealCell(grid, revealed, flagged, row + dr, col + dc);
            }
        }
    }
}

/**
 * Count adjacent flags
 */
function countAdjacentFlags(flagged, row, col) {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr, nc = col + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                if (flagged[nr][nc]) count++;
            }
        }
    }
    return count;
}

/**
 * Count total revealed cells
 */
function countRevealed(revealed) {
    let count = 0;
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            if (revealed[row][col]) count++;
        }
    }
    return count;
}

module.exports = { verifyGame, COLS, ROWS, MINES };

