/**
 * Get Leaderboard Handler
 * GET /leaderboard/{seed}
 * 
 * Returns the top scores for a specific map seed
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const LEADERBOARD_TABLE = process.env.LEADERBOARD_TABLE;

module.exports.handler = async (event) => {
    try {
        // Parse seed from path
        const seedStr = event.pathParameters?.seed;
        const seed = parseInt(seedStr, 10);
        
        if (isNaN(seed) || seed < 1 || seed > 999999) {
            return response(400, { error: 'Invalid seed. Must be a number between 1 and 999999.' });
        }
        
        // Parse query parameters
        const limit = Math.min(
            Math.max(parseInt(event.queryStringParameters?.limit || '50', 10), 1),
            100 // Max 100 results
        );
        
        // Optional: get scores around a specific time (for "your position" view)
        const aroundTime = event.queryStringParameters?.around 
            ? parseInt(event.queryStringParameters.around, 10) 
            : null;
        
        // Query leaderboard
        const result = await dynamo.send(new QueryCommand({
            TableName: LEADERBOARD_TABLE,
            KeyConditionExpression: 'seed = :seed',
            ExpressionAttributeValues: {
                ':seed': seed
            },
            Limit: limit,
            ScanIndexForward: true // Ascending order (fastest times first)
        }));
        
        // Format leaderboard entries
        const leaderboard = (result.Items || []).map((item, index) => ({
            rank: index + 1,
            nickname: item.nickname,
            time: item.time,
            timeFormatted: formatTime(item.time),
            stats: item.stats,
            submittedAt: item.submittedAt
        }));
        
        // Get total count for this seed
        const countResult = await dynamo.send(new QueryCommand({
            TableName: LEADERBOARD_TABLE,
            KeyConditionExpression: 'seed = :seed',
            ExpressionAttributeValues: {
                ':seed': seed
            },
            Select: 'COUNT'
        }));
        
        return response(200, {
            seed: seed,
            totalPlayers: countResult.Count || 0,
            count: leaderboard.length,
            leaderboard: leaderboard
        });
        
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        return response(500, { error: 'Internal server error' });
    }
};

/**
 * Format milliseconds as MM:SS.mmm
 */
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;
    
    if (minutes > 0) {
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    }
    return `${seconds}.${milliseconds.toString().padStart(3, '0')}`;
}

function response(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET, OPTIONS'
        },
        body: JSON.stringify(body)
    };
}

