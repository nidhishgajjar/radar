export interface OpenRouterMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface OpenRouterRequest {
	model: string;
	messages: OpenRouterMessage[];
	temperature?: number;
	max_tokens?: number;
}

export interface OpenRouterResponse {
	id: string;
	choices: Array<{
		message: {
			role: string;
			content: string;
		};
		finish_reason: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export enum OpenRouterErrorType {
	AUTHENTICATION = 'AUTHENTICATION',
	RATE_LIMIT = 'RATE_LIMIT',
	MODEL_OVERLOADED = 'MODEL_OVERLOADED',
	INVALID_PROMPT = 'INVALID_PROMPT',
	TIMEOUT = 'TIMEOUT',
	NETWORK = 'NETWORK',
	SERVER_ERROR = 'SERVER_ERROR'
}

export class OpenRouterError extends Error {
	constructor(
		message: string,
		public type: OpenRouterErrorType,
		public statusCode?: number
	) {
		super(message);
		this.name = 'OpenRouterError';
	}
}
