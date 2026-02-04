/**
 * Test script for the game verifier
 * Run with: node test/testVerifier.js
 */

const { verifyGame } = require('../src/lib/gameVerifier');

console.log('=== Minesweeper Game Verifier Tests ===\n');

// Test 1: Invalid game data
console.log('Test 1: Invalid game data structure');
const result1 = verifyGame({});
console.log(`  Result: ${result1.valid ? 'PASS' : 'FAIL'} - ${result1.reason}`);
console.log(`  Expected: FAIL\n`);

// Test 2: Invalid seed
console.log('Test 2: Invalid seed value');
const result2 = verifyGame({
    seed: -1,
    moves: [],
    finalTime: 1000,
    won: false
});
console.log(`  Result: ${result2.valid ? 'PASS' : 'FAIL'} - ${result2.reason}`);
console.log(`  Expected: FAIL\n`);

// Test 3: Empty game (no moves, claims win)
console.log('Test 3: Empty game claiming win');
const result3 = verifyGame({
    seed: 12345,
    moves: [],
    finalTime: 1000,
    won: true
});
console.log(`  Result: ${result3.valid ? 'PASS' : 'FAIL'} - ${result3.reason}`);
console.log(`  Expected: FAIL (can't win with no moves)\n`);

// Test 4: Valid losing game (no win claimed)
console.log('Test 4: Valid game structure (loss)');
const result4 = verifyGame({
    seed: 12345,
    moves: [
        { t: 0, type: 'reveal', r: 8, c: 15 }
    ],
    finalTime: 500,
    won: false
});
console.log(`  Result: ${result4.valid ? 'PASS' : 'FAIL'} - ${result4.reason || 'Valid'}`);
console.log(`  Expected: PASS (valid loss game)\n`);

// Test 5: Invalid coordinates
console.log('Test 5: Invalid coordinates');
const result5 = verifyGame({
    seed: 12345,
    moves: [
        { t: 0, type: 'reveal', r: 100, c: 100 }
    ],
    finalTime: 500,
    won: false
});
console.log(`  Result: ${result5.valid ? 'PASS' : 'FAIL'} - ${result5.reason}`);
console.log(`  Expected: FAIL\n`);

// Test 6: Timestamps out of order
console.log('Test 6: Timestamps out of order');
const result6 = verifyGame({
    seed: 12345,
    moves: [
        { t: 1000, type: 'reveal', r: 8, c: 15 },
        { t: 500, type: 'reveal', r: 8, c: 16 }
    ],
    finalTime: 1500,
    won: false
});
console.log(`  Result: ${result6.valid ? 'PASS' : 'FAIL'} - ${result6.reason}`);
console.log(`  Expected: FAIL\n`);

// Test 7: Flag on revealed cell
console.log('Test 7: Flag on revealed cell');
const result7 = verifyGame({
    seed: 12345,
    moves: [
        { t: 0, type: 'reveal', r: 8, c: 15 },
        { t: 100, type: 'flag', r: 8, c: 15 }
    ],
    finalTime: 200,
    won: false
});
console.log(`  Result: ${result7.valid ? 'PASS' : 'FAIL'} - ${result7.reason}`);
console.log(`  Expected: FAIL\n`);

// Test 8: Unflag non-flagged cell
console.log('Test 8: Unflag non-flagged cell');
const result8 = verifyGame({
    seed: 12345,
    moves: [
        { t: 0, type: 'reveal', r: 8, c: 15 },
        { t: 100, type: 'unflag', r: 0, c: 0 }
    ],
    finalTime: 200,
    won: false
});
console.log(`  Result: ${result8.valid ? 'PASS' : 'FAIL'} - ${result8.reason}`);
console.log(`  Expected: FAIL\n`);

// Test 9: Valid flag/unflag sequence
console.log('Test 9: Valid flag/unflag sequence');
const result9 = verifyGame({
    seed: 12345,
    moves: [
        { t: 0, type: 'reveal', r: 8, c: 15 },
        { t: 100, type: 'flag', r: 0, c: 0 },
        { t: 200, type: 'unflag', r: 0, c: 0 }
    ],
    finalTime: 300,
    won: false
});
console.log(`  Result: ${result9.valid ? 'PASS' : 'FAIL'} - ${result9.reason || 'Valid'}`);
console.log(`  Expected: PASS\n`);

// Test 10: Chord on unrevealed cell
console.log('Test 10: Chord on unrevealed cell');
const result10 = verifyGame({
    seed: 12345,
    moves: [
        { t: 0, type: 'chord', r: 0, c: 0 }
    ],
    finalTime: 100,
    won: false
});
console.log(`  Result: ${result10.valid ? 'PASS' : 'FAIL'} - ${result10.reason}`);
console.log(`  Expected: FAIL\n`);

// Test 11: Hint moves (should be allowed but tracked)
console.log('Test 11: Hint moves tracked');
const result11 = verifyGame({
    seed: 12345,
    moves: [
        { t: 0, type: 'reveal', r: 8, c: 15 },
        { t: 100, type: 'hint_d', r: -1, c: -1 },
        { t: 200, type: 'hint_e', r: -1, c: -1 }
    ],
    finalTime: 300,
    won: false
});
console.log(`  Result: ${result11.valid ? 'PASS' : 'FAIL'} - ${result11.reason || 'Valid'}`);
console.log(`  Hints used: ${result11.stats?.hintsUsed || 0}`);
console.log(`  Expected: PASS with hintsUsed=2\n`);

console.log('=== Tests Complete ===');

