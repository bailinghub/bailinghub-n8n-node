import type {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IDataObject,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

import { normalizeBaseUrl } from '../shared/client';

export class BailingHubApi implements ICredentialType {
	name = 'bailingHubApi';

	displayName = 'BailingHub API';

	restrictToSupportedNodes = true as const;

	icon: Icon = {
		light: 'file:../nodes/BailingHub/bailinghub.svg',
		dark: 'file:../nodes/BailingHub/bailinghub.dark.svg',
	};

	documentationUrl =
		'https://github.com/bailinghub/bailinghub-n8n-node?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			placeholder: 'https://hub.example.com',
			description: 'The root URL of the BailingHub deployment, without an API path',
			required: true,
		},
		{
			displayName: 'Client Token',
			name: 'clientToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'A per-client token issued in BailingHub. Do not use the BailingHub administrator token.',
			required: true,
		},
		{
			displayName: 'Allow Insecure HTTP',
			name: 'allowInsecureHttp',
			type: 'boolean',
			default: false,
			description:
				'Whether to permit plain HTTP for a private self-hosted network. Keep disabled for internet-facing connections.',
		},
	];

	preAuthentication = async (
		credentials: ICredentialDataDecryptedObject,
	): Promise<IDataObject> => {
		normalizeBaseUrl(
			String(credentials.baseUrl ?? ''),
			credentials.allowInsecureHttp === true,
		);
		return {};
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/$/, "")}}',
			url: '/health',
			headers: {
				Authorization: '=Bearer {{$credentials.clientToken}}',
			},
		},
	};
}
