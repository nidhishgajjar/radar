#!/usr/bin/env node
/**
 * Claude API Server - Wraps `claude -p` for simple prompt/response calls.
 *
 * This is a lightweight alternative to the full agent-server that provides
 * simple LLM capabilities without tool access.
 *
 * Usage: node scripts/claude-api-server.cjs
 * Listens on http://localhost:3001
 *
 * Endpoints:
 *   GET  /health  - Check server status and token availability
 *   POST /prompt  - Send a prompt and get a response
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

// Resolve claude binary: prefer local node_modules, fallback to global
const CLAUDE_BIN = path.resolve(__dirname, '..', 'node_modules', '.bin', 'claude');

const PORT = process.env.CLAUDE_API_PORT || 3001;

/**
 * Build environment for the claude process.
 * If CLAUDE_CODE_OAUTH_TOKEN is set, claude -p will use it for auth.
 */
function buildEnv() {
	return { ...process.env };
}

/**
 * Check if we have authentication available.
 * On Railway, this comes from CLAUDE_CODE_OAUTH_TOKEN env var.
 * Locally, claude uses session auth from ~/.claude.
 */
function hasAuth() {
	const hasOAuthToken = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
	const isDeployed = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_SERVICE_NAME;
	// Locally: always has auth (session). Deployed: needs token.
	return hasOAuthToken || !isDeployed;
}

/**
 * Run `claude -p` with the given prompt and options.
 * Returns a promise that resolves with the response text.
 */
function runClaudePrompt(systemPrompt, userPrompt, options = {}) {
	return new Promise((resolve, reject) => {
		const { maxTokens = 1000, timeoutMs = 30000 } = options;

		// Pipe prompt via stdin to avoid E2BIG errors on large prompts.
		// The -p flag without a value reads from stdin.
		const args = ['-p', '--output-format', 'text', '--model', 'sonnet'];

		if (systemPrompt) {
			args.push('--system-prompt', systemPrompt);
		}

		// Ensure single response
		args.push('--max-turns', '1');

		console.log(`[Claude API] Running prompt (${userPrompt.length} chars, timeout=${timeoutMs}ms)`);
		const startTime = Date.now();

		const child = spawn(CLAUDE_BIN, args, {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: buildEnv(),
			cwd: process.cwd()
		});

		// Write prompt to stdin then close it
		child.stdin.write(userPrompt);
		child.stdin.end();

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (chunk) => {
			stdout += chunk.toString();
		});

		child.stderr.on('data', (chunk) => {
			stderr += chunk.toString();
		});

		const timeout = setTimeout(() => {
			if (!child.killed) {
				child.kill('SIGTERM');
				reject(new Error(`Timeout after ${timeoutMs}ms`));
			}
		}, timeoutMs);

		child.on('close', (code) => {
			clearTimeout(timeout);
			const elapsed = Date.now() - startTime;
			console.log(`[Claude API] Done in ${elapsed}ms (exit ${code})`);

			if (code !== 0) {
				// Check for auth errors
				if (stderr.includes('Invalid API key') || stderr.includes('Please run /login')) {
					reject(new Error('auth_failed'));
					return;
				}
				reject(new Error(`claude exited with code ${code}: ${stderr}`));
				return;
			}

			resolve(stdout.trim());
		});

		child.on('error', (err) => {
			clearTimeout(timeout);
			reject(err);
		});
	});
}

const server = http.createServer(async (req, res) => {
	// CORS headers
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

	if (req.method === 'OPTIONS') {
		res.writeHead(200);
		res.end();
		return;
	}

	// Health check
	if (req.method === 'GET' && req.url === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({
			status: 'ok',
			hasToken: hasAuth(),
			port: PORT
		}));
		return;
	}

	// Prompt endpoint
	if (req.method === 'POST' && req.url === '/prompt') {
		let body = '';
		req.on('data', (chunk) => { body += chunk; });
		req.on('end', async () => {
			try {
				const { system, prompt, maxTokens, timeoutMs } = JSON.parse(body);

				if (!prompt || typeof prompt !== 'string') {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'prompt is required' }));
					return;
				}

				const content = await runClaudePrompt(system, prompt, {
					maxTokens: maxTokens || 1000,
					timeoutMs: timeoutMs || 30000
				});

				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ content }));

			} catch (err) {
				console.error('[Claude API] Error:', err.message);

				if (err.message === 'auth_failed') {
					res.writeHead(401, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({
						error: 'auth_failed',
						message: 'Claude token expired or invalid. Set CLAUDE_CODE_OAUTH_TOKEN env var.'
					}));
					return;
				}

				res.writeHead(500, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: err.message }));
			}
		});
		return;
	}

	// 404 for unknown routes
	res.writeHead(404, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify({ error: 'Not found. Use GET /health or POST /prompt' }));
});

server.listen(PORT, () => {
	console.log(`Claude API Server listening on http://localhost:${PORT}`);
	console.log(`Health:  GET  http://localhost:${PORT}/health`);
	console.log(`Prompt:  POST http://localhost:${PORT}/prompt`);
	console.log('');
	console.log('Auth: Uses CLAUDE_CODE_OAUTH_TOKEN env var (or local session auth)');
	console.log(`Token present: ${hasAuth() ? 'yes' : 'no'}`);
});
