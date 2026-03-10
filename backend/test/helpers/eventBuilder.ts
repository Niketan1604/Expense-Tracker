import { APIGatewayProxyEventV2 } from 'aws-lambda';

export const TEST_USER_ID = 'test-user-123';
export const TEST_EMAIL = 'test@flowmint.dev';

interface EventOptions {
    userId?: string;
    email?: string;
    body?: Record<string, unknown> | null;
    pathParameters?: Record<string, string>;
    queryStringParameters?: Record<string, string>;
    noAuth?: boolean;
}

export const buildEvent = (options: EventOptions = {}): APIGatewayProxyEventV2 => {
    const {
        userId = TEST_USER_ID,
        email = TEST_EMAIL,
        body = null,
        pathParameters,
        queryStringParameters,
        noAuth = false
    } = options;

    return {
        version: '2.0',
        routeKey: 'GET /',
        rawPath: '/',
        rawQueryString: '',
        headers: { 'content-type': 'application/json' },
        requestContext: {
            accountId: '123456789',
            apiId: 'test-api',
            domainName: 'test.execute-api.ap-south-1.amazonaws.com',
            domainPrefix: 'test',
            http: {
                method: 'GET',
                path: '/',
                protocol: 'HTTP/1.1',
                sourceIp: '127.0.0.1',
                userAgent: 'jest'
            },
            requestId: 'test-request-id',
            routeKey: 'GET /',
            stage: 'dev',
            time: '01/Jan/2025:00:00:00 +0000',
            timeEpoch: 1735689600000,
            authorizer: noAuth ? undefined : {
                jwt: {
                    claims: { sub: userId, email },
                    scopes: []
                }
            }
        },
        body: body ? JSON.stringify(body) : null,
        pathParameters: pathParameters,
        queryStringParameters: queryStringParameters,
        isBase64Encoded: false,
        stageVariables: undefined,
        cookies: []
    } as unknown as APIGatewayProxyEventV2;
};