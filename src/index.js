require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { randomUUID } = require('crypto');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { tools } = require('./tools');

function jsonPropsToZod(properties) {
  const shape = {};
  for (const [key, val] of Object.entries(properties)) {
    let schema;
    if (val.type === 'number') schema = z.number();
    else if (val.type === 'string') schema = z.string();
    else if (val.type === 'boolean') schema = z.boolean();
    else schema = z.unknown();
    if (val.description) schema = schema.describe(val.description);
    shape[key] = schema.optional();
  }
  return shape;
}

const app = express();
app.set('trust proxy', true);

// CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'mcp-session-id'],
  exposedHeaders: ['mcp-session-id'],
}));

// Chrome DevTools well-known endpoint
app.get('/.well-known/appspecific/com.chrome.devtools.json', (_, res) => res.json({}));

// Root + Health check
app.get('/', (_, res) => res.json({ status: 'ok', service: 'whoop-mcp' }));
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'whoop-mcp' }));

// OAuth helper - generates auth URL
app.get('/auth', (req, res) => {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const redirectUri =
    req.query.redirect_uri || process.env.WHOOP_REDIRECT_URI || 'http://localhost:3001/callback';
  const scopes = 'offline read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement';

  const authUrl =
    `https://api.prod.whoop.com/oauth/oauth2/auth?` +
    `client_id=${clientId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `state=whoop_mcp`;

  res.json({
    auth_url: authUrl,
    instructions: [
      '1. Visit the auth_url in your browser',
      '2. Authorize the app with your Whoop account',
      '3. Copy the "code" parameter from the redirect URL',
      '4. Exchange it for tokens using: POST https://api.prod.whoop.com/oauth/oauth2/token',
      '   with body: grant_type=authorization_code&code=CODE&redirect_uri=REDIRECT_URI&client_id=CLIENT_ID&client_secret=CLIENT_SECRET',
      '5. Set the access_token as WHOOP_ACCESS_TOKEN env var',
    ],
  });
});

// OAuth callback
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'No code provided' });

  try {
    const tokenRes = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.WHOOP_REDIRECT_URI || 'http://localhost:3001/callback',
        client_id: process.env.WHOOP_CLIENT_ID,
        client_secret: process.env.WHOOP_CLIENT_SECRET,
      }),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) return res.status(400).json(tokens);

    res.json({
      message: 'Success! Set these as environment variables:',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Token refresh endpoint
app.get('/refresh', async (req, res) => {
  const refreshToken = process.env.WHOOP_REFRESH_TOKEN;
  if (!refreshToken) return res.status(400).json({ error: 'No WHOOP_REFRESH_TOKEN set' });

  try {
    const tokenRes = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.WHOOP_CLIENT_ID,
        client_secret: process.env.WHOOP_CLIENT_SECRET,
      }),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) return res.status(400).json(tokens);

    res.json({
      message: 'Tokens refreshed. Update your environment variables:',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function createMcpServer() {
  const server = new McpServer({ name: 'whoop-mcp', version: '1.0.0' });
  tools.forEach((tool) => {
    server.tool(tool.name, tool.description, jsonPropsToZod(tool.inputSchema.properties || {}), async (params) => {
      try {
        const result = await tool.handler(params);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    });
  });
  return server;
}

// Streamable HTTP transport (claude.ai connectors)
const mcpSessions = {};

app.all('/mcp', express.json(), async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];

  if (sessionId && mcpSessions[sessionId]) {
    return mcpSessions[sessionId].transport.handleRequest(req, res, req.body);
  }

  if (req.method !== 'POST') {
    return res.status(404).json({ error: 'Session not found' });
  }

  const newSessionId = randomUUID();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => newSessionId });
  const server = createMcpServer();
  mcpSessions[newSessionId] = { transport, server };
  transport.onclose = () => delete mcpSessions[newSessionId];
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Legacy SSE transport (Claude Desktop / other clients)
const sseTransports = {};

app.get('/sse', async (req, res) => {
  const server = createMcpServer();
  const transport = new SSEServerTransport('/messages', res);
  sseTransports[transport.sessionId] = { transport, server };
  res.on('close', () => delete sseTransports[transport.sessionId]);
  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  const session = sseTransports[req.query.sessionId];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  await session.transport.handlePostMessage(req, res);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Whoop MCP server running on port ${PORT}`));
