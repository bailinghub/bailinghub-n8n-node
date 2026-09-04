import type {
	IExecuteFunctions,
	IDataObject,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';

import { BailingHubClient, normalizeBaseUrl, waitForJob } from '../../shared/client';

export class BailingHub implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'BailingHub',
		name: 'bailingHub',
		icon: { light: 'file:bailinghub.svg', dark: 'file:bailinghub.dark.svg' },
		group: ['transform'],
		version: 1,
		description: 'Query and operate permitted business systems through BailingHub',
		subtitle: '={{$parameter["operation"]}}',
		defaults: { name: 'BailingHub' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'bailingHubApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Submit Governed Job',
						value: 'submit',
						description: 'Submit a task to a configured BailingHub route',
						action: 'Submit a governed job',
					},
					{
						name: 'Get Job',
						value: 'get',
						description: 'Get the current public state and result of a job',
						action: 'Get a job',
					},
					{
						name: 'Wait for Job',
						value: 'wait',
						description: 'Poll a job for a bounded time without resubmitting it',
						action: 'Wait for a job',
					},
				],
				default: 'submit',
			},
			{
				displayName: 'Request ID',
				name: 'requestId',
				type: 'string',
				default: '',
				placeholder: 'order-10001-ai-001',
				description: 'A stable business idempotency key. Reuse it when retrying the same task.',
				required: true,
				displayOptions: { show: { operation: ['submit'] } },
			},
			{
				displayName: 'Route',
				name: 'route',
				type: 'string',
				default: '',
				placeholder: 'order_assistant',
				description: 'A route allowed for this BailingHub client',
				required: true,
				displayOptions: { show: { operation: ['submit'] } },
			},
			{
				displayName: 'Input',
				name: 'input',
				type: 'string',
				typeOptions: { rows: 5 },
				default: '',
				description: 'The task text. BailingHub treats it as untrusted task data.',
				required: true,
				displayOptions: { show: { operation: ['submit'] } },
			},
			{
				displayName: 'Acting Subject Boundary',
				name: 'actingSubjectNotice',
				type: 'notice',
				default: '',
				description:
					'This node does not accept acting-subject metadata. Establish trusted subjects at a business-system boundary, not from model-generated fields.',
				displayOptions: { show: { operation: ['submit'] } },
			},
			{
				displayName: 'Job ID',
				name: 'jobId',
				type: 'string',
				default: '',
				placeholder: '11111111-1111-4111-8111-111111111111',
				description: 'The UUID returned by Submit Governed Job',
				required: true,
				displayOptions: { show: { operation: ['get', 'wait'] } },
			},
			{
				displayName: 'Max Wait Seconds',
				name: 'maxWaitSeconds',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 60 },
				default: 20,
				description: 'Maximum bounded polling time. A timeout returns the latest state.',
				displayOptions: { show: { operation: ['wait'] } },
			},
			{
				displayName: 'Poll Interval Seconds',
				name: 'pollIntervalSeconds',
				type: 'number',
				typeOptions: { minValue: 0.5, maxValue: 10, numberStepSize: 0.5 },
				default: 2,
				description: 'Delay between status requests',
				displayOptions: { show: { operation: ['wait'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const inputItems = this.getInputData();
		const outputItems: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex += 1) {
			try {
				const credentials = await this.getCredentials('bailingHubApi');
				const clientToken = String(credentials.clientToken ?? '').trim();
				if (!clientToken) {
					throw new NodeOperationError(this.getNode(), 'BailingHub Client Token is required.', {
						itemIndex,
					});
				}
				const baseUrl = normalizeBaseUrl(
					credentials.baseUrl,
					credentials.allowInsecureHttp === true,
				);
				const client = new BailingHubClient(baseUrl, async (request) => {
					const options: IHttpRequestOptions = {
						method: request.method,
						url: request.url,
						headers: {
							Accept: 'application/json',
							'User-Agent': 'n8n-nodes-bailinghub',
							Authorization: `Bearer ${clientToken}`,
						},
						body: request.body,
						json: true,
						timeout: request.timeout,
					};
					return await this.helpers.httpRequest.call(this, options);
				});

				const operation = this.getNodeParameter('operation', itemIndex) as string;
				let result: Record<string, unknown>;
				if (operation === 'submit') {
					result = await client.submitJob(
						this.getNodeParameter('requestId', itemIndex),
						this.getNodeParameter('route', itemIndex),
						this.getNodeParameter('input', itemIndex),
					);
				} else if (operation === 'get') {
					result = await client.getJob(this.getNodeParameter('jobId', itemIndex));
				} else if (operation === 'wait') {
					const jobId = this.getNodeParameter('jobId', itemIndex);
					result = await waitForJob(() => client.getJob(jobId), {
						maxWaitSeconds: this.getNodeParameter('maxWaitSeconds', itemIndex),
						pollIntervalSeconds: this.getNodeParameter('pollIntervalSeconds', itemIndex),
						sleep,
					});
				} else {
					throw new NodeOperationError(this.getNode(), `Unsupported operation: ${operation}`, {
						itemIndex,
					});
				}

				outputItems.push({ json: result as IDataObject, pairedItem: { item: itemIndex } });
			} catch (error) {
				const safeError = error instanceof Error ? error : new Error('BailingHub operation failed.');
				const nodeError =
					error instanceof NodeOperationError
						? error
						: new NodeOperationError(this.getNode(), safeError, { itemIndex });
				if (this.continueOnFail()) {
					outputItems.push({
						json: { error: safeError.message },
						error: nodeError,
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				throw nodeError;
			}
		}

		return [outputItems];
	}
}
