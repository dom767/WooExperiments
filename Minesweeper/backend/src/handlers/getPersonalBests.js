/**
 * Get Personal Bests Handler
 * GET /personal/{deviceId}
 * 
 * Returns all personal best scores for a device
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const LEADERBOARD_TABLE = process.env.LEADERBOARD_TABLE;

module.exports.handler = async (event) => {
    try {
        const deviceId = event.pathParameters?.deviceId;
        
        if (!deviceId || deviceId.length < 10) {
            return response(400, { error: 'Invalid deviceId' });
        }
        
        // Parse query parameters
        const limit = Math.min(
            Math.max(parseInt(event.queryStringParameters?.limit || '50', 10), 1),
            100
        );
        
        // Query personal bests using GSI
        const result = await dynamo.send(new QueryCommand({
            TableName: LEADERBOARD_TABLE,
            IndexName: 'device-seed-index',
            KeyConditionExpression: 'deviceId = :deviceId',
            ExpressionAttributeValues: {
                ':deviceId': deviceId
            },
            Limit: limit,
            ScanIndexForward: true // Sort by seed ascending
        }));
        
        // Format results
        const personalBests = (result.Items || []).map(item => ({
            seed: item.seed,
            time: item.time,
            timeFormatted: formatTime(item.time),
            nickname: item.nickname,
            stats: item.stats,
            submittedAt: item.submittedAt
        }));
        
        // Calculate aggregate stats
        const totalGames = personalBests.length;
        const totalTime = personalBests.reduce((sum, item) => sum + item.time, 0);
        const bestTime = totalGames > 0 ? Math.min(...personalBests.map(p => p.time)) : null;
        const averageTime = totalGames > 0 ? Math.round(totalTime / totalGames) : null;
        
        return response(200, {
            deviceId: deviceId.substring(0, 8) + '...', // Partial ID for privacy
            totalGames: totalGames,
            stats: {
                bestTime: bestTime,
                bestTimeFormatted: bestTime ? formatTime(bestTime) : null,
                averageTime: averageTime,
                averageTimeFormatted: averageTime ? formatTime(averageTime) : null
            },
            personalBests: personalBests
        });
        
    } catch (error) {
        console.error('Error getting personal bests:', error);
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

