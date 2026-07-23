const assert = require('node:assert/strict');
const test = require('node:test');

const {
	BailingHubClient,
	BailingHubClientError,
	CLIENT_API_ENDPOINTS,
	CLIENT_API_KNOWN_STATUSES,
	CLIENT_API_LIMITS,
	CLIENT_API_TERMINAL_STATUSES,
	normalizeBaseUrl,
	waitForJob,
} = require('../dist/shared/client.js');
const compatibility = require('../compatibility/client-api.json');

const JOB_ID = '11111111-1111-4111-8111-111111111111';

test('Client API compatibility declaration matches adapter code', () => {
	assert.deepEqual(compatibility.endpoint_contracts, CLIENT_API_ENDPOINTS);
	assert.deepEqual(compatibility.known_job_statuses, [...CLIENT_API_KNOWN_STATUSES]);
	assert.deepEqual(compatibility.terminal_job_statuses, [...CLIENT_API_TERMINAL_STATUSES]);
	assert.deepEqual(compatibility.limits, CLIENT_API_LIMITS);
});

test('normalizes URLs and requires explicit opt-in for insecure remote HTTP', () => {
	assert.equal(normalizeBaseUrl('https://hub.example.com/base/'), 'https://hub.example.com/base');
	assert.equal(normalizeBaseUrl('http://127.0.0.1:3000/'), 'http://127.0.0.1:3000');
	assert.equal(
		normalizeBaseUrl('http://hub.internal:3000/', true),
		'http://hub.internal:3000',
	);
	assert.throws(() => normalizeBaseUrl('http://hub.example.com'), /Use HTTPS/);
	assert.throws(
		() => normalizeBaseUrl('https://admin:secret@hub.example.com'),
		/embedded credentials/,
	);
});

test('submit uses only the public minimal contract and filters the response', async () => {
	const calls = [];
	const client = new BailingHubClient('https://hub.example.com', async (options) => {
		calls.push(options);
		return {
			job_id: JOB_ID,
			request_id: 'n8n:run:step',
			status: 'queued',
			route: 'orders',
			project: 'must-not-leak',
			metadata: { principal: { id: 'must-not-leak' } },
		};
	});

	const result = await client.submitJob('n8n:run:step', 'orders', 'Read order 42');
	assert.deepEqual(result, {
		job_id: JOB_ID,
		request_id: 'n8n:run:step',
		status: 'queued',
		terminal: false,
		route: 'orders',
	});
	assert.deepEqual(calls[0].body, {
		request_id: 'n8n:run:step',
		route: 'orders',
		input: 'Read order 42',
	});
	assert.equal(calls[0].url, 'https://hub.example.com/run');
});

test('get returns only documented result fields', async () => {
	const client = new BailingHubClient('https://hub.example.com', async () => ({
		job_id: JOB_ID,
		request_id: 'r1',
		status: 'done',
		result: { text: 'done' },
		report: { severity: 'P2' },
		raw_result: 'raw',
		usage: { tokens: 10 },
		metadata: { private: true },
		dispatch: { target_config: { secret: true } },
	}));
	assert.deepEqual(await client.getJob(JOB_ID), {
		job_id: JOB_ID,
		request_id: 'r1',
		status: 'done',
		terminal: true,
		report: { severity: 'P2' },
		result: { text: 'done' },
		usage: { tokens: 10 },
		raw_result: 'raw',
	});
});

test('upstream failures do not expose arbitrary bodies or credentials', async () => {
	const client = new BailingHubClient('https://hub.example.com', async () => {
		throw { statusCode: 401, message: 'secret-token and private stack trace' };
	});
	await assert.rejects(
		client.getJob(JOB_ID),
		(error) =>
			error instanceof BailingHubClientError &&
			error.message === 'BailingHub rejected the Client Token.' &&
			!error.message.includes('secret-token'),
	);
});

test('response size is bounded before data reaches workflow output', async () => {
	const client = new BailingHubClient('https://hub.example.com', async () => ({
		job_id: JOB_ID,
		status: 'done',
		raw_result: 'x'.repeat(1024 * 1024),
	}));
	await assert.rejects(client.getJob(JOB_ID), /1 MiB safety limit/);
});

test('wait reaches a terminal result without resubmitting the job', async () => {
	const states = [
		{ job_id: JOB_ID, request_id: 'r1', status: 'queued', terminal: false },
		{ job_id: JOB_ID, request_id: 'r1', status: 'done', terminal: true },
	];
	let now = 0;
	let getCount = 0;
	const result = await waitForJob(
		async () => {
			getCount += 1;
			return states.shift();
		},
		{
			maxWaitSeconds: 20,
			pollIntervalSeconds: 2,
			now: () => now,
			sleep: async (milliseconds) => {
				now += milliseconds;
			},
		},
	);
	assert.equal(getCount, 2);
	assert.equal(result.terminal, true);
	assert.equal(result.wait_timed_out, false);
	assert.equal(result.poll_count, 2);
});

test('wait timeout returns the latest state and never creates a second job', async () => {
	let now = 0;
	let getCount = 0;
	const result = await waitForJob(
		async () => {
			getCount += 1;
			return { job_id: JOB_ID, request_id: 'r1', status: 'running', terminal: false };
		},
		{
			maxWaitSeconds: 1,
			pollIntervalSeconds: 1,
			now: () => now,
			sleep: async (milliseconds) => {
				now += milliseconds;
			},
		},
	);
	assert.equal(getCount, 2);
	assert.equal(result.status, 'running');
	assert.equal(result.wait_timed_out, true);
});
