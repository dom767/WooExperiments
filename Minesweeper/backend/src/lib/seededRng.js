/**
 * Seeded Random Number Generator (mulberry32)
 * This MUST match the client implementation exactly for replay verification
 */

function createSeededRng(seed) {
    // Ensure seed is a 32-bit unsigned integer
    seed = seed >>> 0;
    
    return function() {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

module.exports = { createSeededRng };

