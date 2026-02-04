# Minesweeper Backend API

Serverless backend for Minesweeper leaderboards with replay verification anti-cheat.

## Prerequisites

1. **Node.js 18+** installed
2. **AWS Account** with credentials configured
3. **Serverless Framework** installed globally:
   ```bash
   npm install -g serverless
   ```

## Setup

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Configure AWS credentials:**
   ```bash
   aws configure
   ```
   Enter your AWS Access Key ID, Secret Access Key, and preferred region.

3. **Deploy to AWS:**
   ```bash
   npm run deploy
   ```
   
   For production:
   ```bash
   npm run deploy:prod
   ```

4. **Note the API endpoint** from the deployment output. It will look like:
   ```
   https://abc123xyz.execute-api.eu-west-2.amazonaws.com/dev
   ```

## API Endpoints

### POST /scores
Submit a verified game score.

**Request Body:**
```json
{
  "seed": 123456,
  "finalTime": 45230,
  "moves": [...],
  "stats": {
    "totalMoves": 127,
    "reveals": 89,
    "flags": 12,
    "hintsUsed": 0,
    "undosUsed": 0
  },
  "won": true,
  "nickname": "PlayerOne",
  "deviceId": "uuid-device-id"
}
```

**Response:**
```json
{
  "success": true,
  "rank": 5,
  "time": 45230,
  "isPersonalBest": true
}
```

### GET /leaderboard/{seed}
Get top scores for a map seed.

**Query Parameters:**
- `limit` (optional): Number of results (1-100, default 50)

**Response:**
```json
{
  "seed": 123456,
  "totalPlayers": 42,
  "count": 10,
  "leaderboard": [
    {
      "rank": 1,
      "nickname": "SpeedKing",
      "time": 32450,
      "timeFormatted": "32.450",
      "stats": {...},
      "submittedAt": 1706234567890
    }
  ]
}
```

### GET /personal/{deviceId}
Get personal bests for a device.

**Response:**
```json
{
  "deviceId": "abc12345...",
  "totalGames": 15,
  "stats": {
    "bestTime": 32450,
    "averageTime": 58320
  },
  "personalBests": [...]
}
```

### GET /daily
Get today's daily challenge seed.

**Response:**
```json
{
  "date": "2024-02-04",
  "seed": 847291,
  "expiresIn": 43200,
  "expiresAt": "2024-02-05T00:00:00.000Z"
}
```

## Anti-Cheat System

The backend verifies every submitted game by replaying it:

1. **Deterministic Maps**: Same seed always generates same mine layout
2. **Replay Verification**: Server re-executes all moves to verify:
   - Valid move sequences
   - Correct timestamps (increasing)
   - No impossible moves (revealing flagged cells, etc.)
   - Game actually reaches win state
   - Final time matches move timestamps

## Architecture

```
API Gateway → Lambda Functions → DynamoDB
                    ↓
            Game Verifier (replays game)
```

### DynamoDB Tables

**LeaderboardTable:**
- Primary Key: `seed` (Number) + `time` (Number)
- GSI: `deviceId` + `seed` (for personal bests lookup)

## Cost Estimates

| Daily Submissions | Monthly Cost |
|-------------------|--------------|
| 10,000 | ~$0-5 (free tier) |
| 100,000 | ~$20 |
| 1,000,000 | ~$200-250 |

## Development

**View logs:**
```bash
npm run logs:submit
npm run logs:leaderboard
```

**Test verifier locally:**
```bash
npm test
```

**Remove deployment:**
```bash
npm run remove
```

## Files

```
backend/
├── package.json
├── serverless.yml           # AWS infrastructure
├── src/
│   ├── handlers/
│   │   ├── submitScore.js   # POST /scores
│   │   ├── getLeaderboard.js
│   │   ├── getPersonalBests.js
│   │   └── getDailySeed.js
│   └── lib/
│       ├── seededRng.js     # Must match client
│       └── gameVerifier.js  # Replay verification
└── test/
    └── testVerifier.js
```

