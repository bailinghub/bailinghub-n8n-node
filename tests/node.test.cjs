const assert = require('node:assert/strict');
const test = require('node:test');

const { BailingHub } = require('../dist/nodes/BailingHub/BailingHub.node.js');
const {
	BailingHubApi,
} = require('../dist/credentials/BailingHubApi.credentials.js');
const nodeMetadata = require('../nodes/BailingHub/BailingHub.node.json');

const JOB_ID = '11111111-1111-4111-8111-111111111111';

function executionContext(parameters, request) {
	return {
		continueOnFail: () => false,
		getCredentials: async () => ({
			baseUrl: 'https://hub.example.com/',
			clientToken: 'test-token',
			allowInsecureHttp: false,
		}),
		getInputData: () => [{ json: {} }],
		getNode: () => ({
			id: 'bailinghub-test-node',
			name: 'BailingHub',
			type: 'n8n-nodes-bailinghub.bailingHub',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getNodeParameter: (name) => parameters[name],
		helpers: {
			httpRequest: request,
		},
	};
}

test('Creator Portal metadata identifies the exact node and uses supported categories', () => {
	assert.equal(nodeMetadata.node, 'n8n-nodes-bailinghub.bailingHub');
	assert.deepEqual(nodeMetadata.categories, ['Development']);
});

test('the n8n node submits through the public client API and returns paired output', async () => {
	const calls = [];
	const context = executionContext(
		{
			operation: 'submit',
			requestId: 'workflow-42-refund',
			route: 'refund_assistant',
			input: 'Review refund request 42',
		},
		async (options) => {
			calls.push(options);
			return {
				job_id: JOB_ID,
				request_id: 'workflow-42-refund',
				status: 'queued',
				route: 'refund_assistant',
				metadata: { must_not_reach_workflow_output: true },
			};
		},
	);

	const output = await BailingHub.prototype.execute.call(context);
	assert.deepEqual(output, [
		[
			{
				json: {
					job_id: JOB_ID,
					request_id: 'workflow-42-refund',
					status: 'queued',
					terminal: false,
					route: 'refund_assistant',
				},
				pairedItem: { item: 0 },
			},
		],
	]);
	assert.equal(calls[0].url, 'https://hub.example.com/run');
	assert.equal(calls[0].headers.Authorization, 'Bearer test-token');
	assert.deepEqual(calls[0].body, {
		request_id: 'workflow-42-refund',
		route: 'refund_assistant',
		input: 'Review refund request 42',
	});
});

test('the n8n node rejects insecure remote endpoints before any request is sent', async () => {
	let called = false;
	const context = executionContext({ operation: 'get', jobId: JOB_ID }, async () => {
		called = true;
		return {};
	});
	context.getCredentials = async () => ({
		baseUrl: 'http://hub.example.com',
		clientToken: 'test-token',
		allowInsecureHttp: false,
	});

	await assert.rejects(
		BailingHub.prototype.execute.call(context),
		/Use HTTPS for non-loopback BailingHub connections/,
	);
	assert.equal(called, false);
});

test('credential testing rejects insecure remote endpoints before authentication', async () => {
	const credentialType = new BailingHubApi();
	assert.equal(credentialType.restrictToSupportedNodes, true);
	assert.equal(credentialType.authenticate, undefined);
	assert.deepEqual(credentialType.test.request.headers, {
		Authorization: '=Bearer {{$credentials.clientToken}}',
	});

	await assert.rejects(
		credentialType.preAuthentication({
			baseUrl: 'http://hub.example.com',
			clientToken: 'must-not-be-sent',
			allowInsecureHttp: false,
		}),
		/Use HTTPS for non-loopback BailingHub connections/,
	);

	assert.deepEqual(
		await credentialType.preAuthentication({
			baseUrl: 'http://127.0.0.1:3000',
			clientToken: 'local-test-token',
			allowInsecureHttp: false,
		}),
		{},
	);
});
