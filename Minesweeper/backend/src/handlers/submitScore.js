/**
 * Submit Score Handler
 * POST /scores
 * 
 * Accepts game replays, verifies them server-side, and stores valid scores
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { verifyGame } = require('../lib/gameVerifier');

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const LEADERBOARD_TABLE = process.env.LEADERBOARD_TABLE;

module.exports.handler = async (event) => {
    try {
        // Parse request body
        let body;
        try {
            body = JSON.parse(event.body);
        } catch (e) {
            return response(400, { error: 'Invalid JSON body' });
        }
        
        const { seed, finalTime, moves, stats, won, nickname, deviceId } = body;
        
        // Validate required fields
        if (!seed || typeof seed !== 'number') {
            return response(400, { error: 'Missing or invalid seed' });
        }
        
        if (!Array.isArray(moves)) {
            return response(400, { error: 'Missing or invalid moves array' });
        }
        
        if (!deviceId || typeof deviceId !== 'string') {
            return response(400, { error: 'Missing or invalid deviceId' });
        }
        
        if (!nickname || typeof nickname !== 'string') {
            return response(400, { error: 'Missing or invalid nickname' });
        }
        
        // Only accept winning games for leaderboard
        if (!won) {
            return response(400, { error: 'Only winning games can be submitted to leaderboard' });
        }
        
        // Verify the game replay
        console.log(`Verifying game: seed=${seed}, moves=${moves.length}, time=${finalTime}ms`);
        const verification = verifyGame(body);
        
        if (!verification.valid) {
            console.log(`Verification failed: ${verification.reason}`);
            return response(400, { 
                error: 'Game verification failed',
                reason: verification.reason 
            });
        }
        
        console.log(`Verification passed: time=${verification.verifiedTime}ms`);
        
        const timeMs = Math.floor(finalTime);
        const timestamp = Date.now();
        const sanitizedNickname = nickname.substring(0, 20).replace(/[<>]/g, ''); // Basic sanitization
        
        // Check for existing score from this device for this seed
        const existingScores = await dynamo.send(new QueryCommand({
            TableName: LEADERBOARD_TABLE,
            IndexName: 'device-seed-index',
            KeyConditionExpression: 'deviceId = :deviceId AND seed = :seed',
            ExpressionAttributeValues: {
                ':deviceId': deviceId,
                ':seed': seed
            }
        }));
        
        const existingBest = existingScores.Items?.[0];
        
        // If not a personal best, still acknowledge but don't update leaderboard
        if (existingBest && existingBest.time <= timeMs) {
            return response(200, { 
                success: true,
                message: 'Score recorded but not a personal best',
                personalBest: existingBest.time,
                submitted: timeMs,
                isPersonalBest: false
            });
        }
        
        // If there's an existing score, delete it (we'll add the new better one)
        if (existingBest) {
            await dynamo.send(new DeleteCommand({
                TableName: LEADERBOARD_TABLE,
                Key: {
                    seed: existingBest.seed,
                    time: existingBest.time
                }
            }));
        }
        
        // Save to leaderboard
        const item = {
            seed: seed,
            time: timeMs,
            nickname: sanitizedNickname,
            deviceId: deviceId,
            stats: {
                totalMoves: stats?.totalMoves || moves.length,
                reveals: stats?.reveals || 0,
                flags: stats?.flags || 0,
                hintsUsed: verification.stats?.hintsUsed || stats?.hintsUsed || 0,
                undosUsed: verification.stats?.undosUsed || stats?.undosUsed || 0
            },
            submittedAt: timestamp,
            verified: true
        };
        
        await dynamo.send(new PutCommand({
            TableName: LEADERBOARD_TABLE,
            Item: item
        }));
        
        // Get the player's rank
        const betterScores = await dynamo.send(new QueryCommand({
            TableName: LEADERBOARD_TABLE,
            KeyConditionExpression: 'seed = :seed AND #time < :time',
            ExpressionAttributeNames: { '#time': 'time' },
            ExpressionAttributeValues: {
                ':seed': seed,
                ':time': timeMs
            },
            Select: 'COUNT'
        }));
        
        const rank = (betterScores.Count || 0) + 1;
        
        console.log(`Score saved: seed=${seed}, time=${timeMs}ms, rank=${rank}`);
        
        return response(200, {
            success: true,
            message: 'Score submitted successfully',
            rank: rank,
            time: timeMs,
            isPersonalBest: true,
            previousBest: existingBest?.time || null
        });
        
    } catch (error) {
        console.error('Error submitting score:', error);
        return response(500, { error: 'Internal server error' });
    }
};

function response(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify(body)
    };
}

