/**
 * Types for Claude API client.
 */

export interface ClaudePromptRequest {
	system?: string;
	prompt: string;
	maxTokens?: number;
	timeoutMs?: number;
}

export interface ClaudePromptResponse {
	content: string;
	error?: string;
}

export interface ClaudeHealthResponse {
	status: 'ok' | 'error';
	hasToken: boolean;
	port: number;
}

export enum ClaudeErrorType {
	AUTHENTICATION = 'authentication',
	TIMEOUT = 'timeout',
	NETWORK = 'network',
	SERVER_ERROR = 'server_error',
	INVALID_RESPONSE = 'invalid_response'
}

export class ClaudeError extends Error {
	constructor(
		message: string,
		public type: ClaudeErrorType,
		public statusCode?: number
	) {
		super(message);
		this.name = 'ClaudeError';
	}
}
