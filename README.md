# Whoop MCP Server

MCP (Model Context Protocol) server that connects Claude to your Whoop recovery, sleep, strain, and workout data.

## Tools

| Tool | Description |
|------|-------------|
| `get_profile` | Get athlete profile including name, weight, height, max HR |
| `get_recovery` | Recovery scores, HRV, resting HR, SpO2, skin temperature |
| `get_sleep` | Sleep stages (light/deep/REM), performance, efficiency, respiratory rate |
| `get_strain` | Daily strain scores, kilojoules burned, heart rate stats |
| `get_workouts` | Workout details including sport type, strain, HR zones, distance |
| `get_weekly_summary` | Weekly averages for recovery, sleep, and strain trends |

## Setup

### 1. Register a Whoop Developer App

1. Go to [developer.whoop.com](https://developer.whoop.com)
2. Sign in with your Whoop account
3. Create a new app in the Developer Dashboard
4. Request all scopes: `read:recovery`, `read:cycles`, `read:workout`, `read:sleep`, `read:profile`, `read:body_measurement`
5. Set redirect URI to your deployed URL + `/callback` (e.g. `https://your-app.onrender.com/callback`)

### 2. Get Access Token

Visit `https://your-app.onrender.com/auth` after deploying, or run locally:

```bash
cp env.example .env
# Fill in WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET
npm start
# Visit http://localhost:3001/auth
# Follow the OAuth flow to get your access token
```

### 3. Deploy to Render

1. Push to GitHub
2. Create a new Web Service on Render
3. Set environment variables: `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_ACCESS_TOKEN`, `WHOOP_REFRESH_TOKEN`, `WHOOP_REDIRECT_URI`
4. Deploy

### 4. Connect to Claude

Add the MCP server URL (e.g. `https://your-app.onrender.com/sse`) in Claude's integrations settings.

## Token Refresh

Whoop access tokens expire. Visit `/refresh` to get new tokens using your refresh token.

## License

MIT
