/**
 * Get Daily Seed Handler
 * GET /daily
 * 
 * Returns a deterministic daily seed so all players can compete on the same map
 */

module.exports.handler = async (event) => {
    try {
        // Get current date in UTC
        const now = new Date();
        const dateString = now.toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Generate deterministic seed from date
        // Using a simple hash of the date string
        const seed = hashDateToSeed(dateString);
        
        // Calculate time until next daily seed
        const tomorrow = new Date(now);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours(0, 0, 0, 0);
        const secondsUntilNext = Math.floor((tomorrow - now) / 1000);
        
        return response(200, {
            date: dateString,
            seed: seed,
            expiresIn: secondsUntilNext,
            expiresAt: tomorrow.toISOString(),
            message: "Today's daily challenge seed"
        });
        
    } catch (error) {
        console.error('Error getting daily seed:', error);
        return response(500, { error: 'Internal server error' });
    }
};

/**
 * Hash a date string to a seed number (1-999999)
 * This is deterministic - same date always produces same seed
 */
function hashDateToSeed(dateString) {
    let hash = 0;
    const str = 'minesweeper-daily-' + dateString;
    
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Convert to positive number in range 1-999999
    const seed = (Math.abs(hash) % 999999) + 1;
    return seed;
}

function response(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Cache-Control': 'public, max-age=60' // Cache for 1 minute
        },
        body: JSON.stringify(body)
    };
}

