const TERMINAL_STATUSES = new Set(['done', 'error', 'rejected']);
const KNOWN_STATUSES = new Set(['queued', 'running', 'dispatched', ...TERMINAL_STATUSES]);
const ROUTE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const JOB_ID_PATTERN =
	/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const MAX_RESPONSE_BYTES = 1024 * 1024;

export type BailingHubHttpRequest = (options: {
	method: 'GET' | 'POST';
	url: string;
	body?: Record<string, unknown>;
	timeout: number;
}) => Promise<unknown>;

export type BailingHubJob = Record<string, unknown> & {
	job_id: string;
	request_id: string;
	status: string;
	terminal: boolean;
};

export class BailingHubClientError extends Error {
	constructor(
		message: string,
		public readonly statusCode?: number,
		public readonly retryable = false,
	) {
		super(message);
		this.name = 'BailingHubClientError';
	}
}

export function normalizeBaseUrl(value: unknown, allowInsecureHttp = false): string {
	const raw = String(value ?? '').trim();
	if (!raw) throw new Error('BailingHub Base URL is required.');
	if (!URL.canParse(raw)) {
		throw new Error('BailingHub Base URL must be an absolute HTTP(S) URL.');
	}
	const parsed = new URL(raw);
	if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
		throw new Error('BailingHub Base URL must be an absolute HTTP(S) URL.');
	}
	if (parsed.username || parsed.password) {
		throw new Error('BailingHub Base URL must not contain embedded credentials.');
	}
	if (parsed.search || parsed.hash) {
		throw new Error('BailingHub Base URL must not contain a query string or fragment.');
	}
	if (
		parsed.protocol === 'http:' &&
		!allowInsecureHttp &&
		!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())
	) {
		throw new Error(
			'Use HTTPS for non-loopback BailingHub connections, or explicitly allow insecure HTTP.',
		);
	}

	parsed.pathname = parsed.pathname.replace(/\/+$/, '');
	return parsed.toString().replace(/\/$/, '');
}

function requireText(value: unknown, name: string, maxLength: number): string {
	const text = String(value ?? '').trim();
	if (!text) throw new Error(`${name} is required.`);
	if (text.length > maxLength) throw new Error(`${name} must not exceed ${maxLength} characters.`);
	return text;
}

function asObject(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new BailingHubClientError('BailingHub returned a non-object JSON response.');
	}
	let serialized: string | undefined;
	try {
		serialized = JSON.stringify(value);
	} catch {
		serialized = undefined;
	}
	if (serialized === undefined) {
		throw new BailingHubClientError('BailingHub returned an invalid JSON response.');
	}
	if (Buffer.byteLength(serialized, 'utf8') > MAX_RESPONSE_BYTES) {
		throw new BailingHubClientError('BailingHub response exceeded the 1 MiB safety limit.');
	}
	return value as Record<string, unknown>;
}

function optionalObject(
	body: Record<string, unknown>,
	key: string,
): Record<string, unknown> | undefined {
	const value = body[key];
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'object' || Array.isArray(value)) {
		throw new BailingHubClientError(`BailingHub returned an invalid ${key} value.`);
	}
	return value as Record<string, unknown>;
}

function normalizeJob(value: unknown, requireRequestId = false): BailingHubJob {
	const body = asObject(value);
	const jobId = String(body.job_id ?? body.id ?? '').trim();
	const requestId = String(body.request_id ?? '').trim();
	const status = String(body.status ?? '').trim();
	if (!JOB_ID_PATTERN.test(jobId) || !KNOWN_STATUSES.has(status)) {
		throw new BailingHubClientError('BailingHub returned an invalid job response.');
	}
	if (requireRequestId && !requestId) {
		throw new BailingHubClientError('BailingHub returned a job without request_id.');
	}
	if (requestId.length > 128) {
		throw new BailingHubClientError('BailingHub returned an invalid request_id.');
	}

	const normalized: BailingHubJob = {
		job_id: jobId,
		request_id: requestId,
		status,
		terminal: TERMINAL_STATUSES.has(status),
	};
	if (typeof body.route === 'string' && body.route.length <= 64) normalized.route = body.route;

	for (const key of ['report', 'result', 'usage']) {
		const objectValue = optionalObject(body, key);
		if (objectValue !== undefined) normalized[key] = objectValue;
	}
	if (body.raw_result !== undefined && body.raw_result !== null) {
		if (typeof body.raw_result !== 'string') {
			throw new BailingHubClientError('BailingHub returned an invalid raw_result value.');
		}
		normalized.raw_result = body.raw_result;
	}
	if (body.error !== undefined && body.error !== null) {
		if (typeof body.error !== 'string') {
			throw new BailingHubClientError('BailingHub returned an invalid error value.');
		}
		normalized.error = body.error.slice(0, 1000);
	}
	for (const key of ['created_at', 'updated_at']) {
		const timestamp = body[key];
		if (timestamp !== undefined && timestamp !== null) {
			if (typeof timestamp !== 'string' || timestamp.length > 100) {
				throw new BailingHubClientError(`BailingHub returned an invalid ${key} value.`);
			}
			normalized[key] = timestamp;
		}
	}
	return normalized;
}

function numberInRange(value: unknown, name: string, minimum: number, maximum: number): number {
	if (typeof value === 'boolean') {
		throw new Error(`${name} must be a number between ${minimum} and ${maximum}.`);
	}
	const number = Number(value);
	if (!Number.isFinite(number) || number < minimum || number > maximum) {
		throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
	}
	return number;
}

function statusCodeFrom(error: unknown): number | undefined {
	if (typeof error !== 'object' || error === null) return undefined;
	const candidate = error as Record<string, unknown>;
	for (const key of ['httpCode', 'statusCode', 'status']) {
		const value = Number(candidate[key]);
		if (Number.isInteger(value) && value >= 100 && value <= 599) return value;
	}
	const response = candidate.response;
	if (typeof response === 'object' && response !== null) {
		const responseRecord = response as Record<string, unknown>;
		for (const key of ['statusCode', 'status']) {
			const value = Number(responseRecord[key]);
			if (Number.isInteger(value) && value >= 100 && value <= 599) return value;
		}
	}
	return undefined;
}

function publicHttpError(error: unknown): BailingHubClientError {
	if (error instanceof BailingHubClientError) return error;
	const statusCode = statusCodeFrom(error);
	let message = 'Could not connect to BailingHub.';
	if (statusCode === 400) message = 'BailingHub rejected the request as invalid.';
	else if (statusCode === 401) message = 'BailingHub rejected the Client Token.';
	else if (statusCode === 403) message = 'The BailingHub client is not allowed to perform this operation.';
	else if (statusCode === 404) message = 'The BailingHub job was not found or is not owned by this client.';
	else if (statusCode === 409) {
		message = 'BailingHub rejected the request because of an idempotency or routing conflict.';
	} else if (statusCode === 429) {
		message = 'The BailingHub client rate limit was exceeded. Retry the same request ID later.';
	} else if (statusCode !== undefined && statusCode >= 500) {
		message = 'BailingHub is temporarily unavailable.';
	} else if (statusCode !== undefined) {
		message = `BailingHub rejected the request (HTTP ${statusCode}).`;
	}
	return new BailingHubClientError(
		message,
		statusCode,
		statusCode === 408 || statusCode === 425 || statusCode === 429 || (statusCode ?? 0) >= 500,
	);
}

export class BailingHubClient {
	constructor(
		private readonly baseUrl: string,
		private readonly request: BailingHubHttpRequest,
	) {}

	async submitJob(requestIdValue: unknown, routeValue: unknown, inputValue: unknown) {
		const requestId = requireText(requestIdValue, 'Request ID', 128);
		const route = requireText(routeValue, 'Route', 64);
		const input = requireText(inputValue, 'Input', 100_000);
		if (!ROUTE_PATTERN.test(route)) {
			throw new Error('Route must match ^[a-z0-9][a-z0-9_-]{1,63}$.');
		}
		const response = await this.perform({
			method: 'POST',
			url: `${this.baseUrl}/run`,
			body: { request_id: requestId, route, input },
			timeout: 15_000,
		});
		return normalizeJob(response, true);
	}

	async getJob(jobIdValue: unknown) {
		const jobId = requireText(jobIdValue, 'Job ID', 36);
		if (!JOB_ID_PATTERN.test(jobId)) {
			throw new Error('Job ID must be a UUID returned by BailingHub.');
		}
		const response = await this.perform({
			method: 'GET',
			url: `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}`,
			timeout: 15_000,
		});
		return normalizeJob(response);
	}

	private async perform(options: Parameters<BailingHubHttpRequest>[0]): Promise<unknown> {
		try {
			return await this.request(options);
		} catch (error) {
			throw publicHttpError(error);
		}
	}
}

export async function waitForJob(
	getJob: () => Promise<BailingHubJob>,
	options: {
		maxWaitSeconds: unknown;
		pollIntervalSeconds: unknown;
		now?: () => number;
		sleep: (milliseconds: number) => Promise<void>;
	},
): Promise<BailingHubJob> {
	const waitSeconds = numberInRange(options.maxWaitSeconds, 'Max Wait Seconds', 1, 60);
	const pollSeconds = numberInRange(options.pollIntervalSeconds, 'Poll Interval Seconds', 0.5, 10);
	const now = options.now ?? Date.now;
	const sleep = options.sleep;
	const startedAt = now();
	const deadline = startedAt + waitSeconds * 1000;
	let pollCount = 1;
	let latest = await getJob();

	while (!latest.terminal) {
		const remaining = deadline - now();
		if (remaining <= 0) break;
		await sleep(Math.min(pollSeconds * 1000, remaining));
		latest = await getJob();
		pollCount += 1;
	}

	return {
		...latest,
		wait_timed_out: !latest.terminal,
		poll_count: pollCount,
		elapsed_ms: Math.max(0, now() - startedAt),
	};
}
