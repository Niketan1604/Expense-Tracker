import { APIGatewayProxyResultV2 } from 'aws-lambda';

const ALLOWED_ORIGIN = process.env.CLOUDFRONT_DOMAIN
  ? `https://${process.env.CLOUDFRONT_DOMAIN}`
  : 'http://localhost:3000';

const baseHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

export const ok = <T>(data: T): APIGatewayProxyResultV2 => ({
  statusCode: 200, headers: baseHeaders,
  body: JSON.stringify({ data })
});

export const created = <T>(data: T): APIGatewayProxyResultV2 => ({
  statusCode: 201, headers: baseHeaders,
  body: JSON.stringify({ data })
});

export const noContent = (): APIGatewayProxyResultV2 => ({
  statusCode: 204, headers: baseHeaders, body: ''
});

export const badRequest = (message: string): APIGatewayProxyResultV2 => ({
  statusCode: 400, headers: baseHeaders,
  body: JSON.stringify({ error: message })
});

export const notFound = (resource: string): APIGatewayProxyResultV2 => ({
  statusCode: 404, headers: baseHeaders,
  body: JSON.stringify({ error: `${resource} not found` })
});

export const internalError = (err: unknown): APIGatewayProxyResultV2 => {
  console.error('[InternalError]', err);
  return {
    statusCode: 500, headers: baseHeaders,
    body: JSON.stringify({ error: 'Internal server error' })
  };
};

// Extracts userId from Cognito JWT claims injected by API Gateway
export const getUserId = (
  event: { requestContext?: { authorizer?: { jwt?: { claims?: Record<string, string> } } } }
): string | null => {
  return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null;
};