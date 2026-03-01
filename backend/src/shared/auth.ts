import { APIGatewayProxyEventV2 } from 'aws-lambda';

// =========================================================
// JWT Claims Helpers
//
// API Gateway JWT authorizer injects Cognito token claims
// into event.requestContext.authorizer.jwt.claims.
//
// The AWS Lambda types package doesn't fully type this — the
// authorizer context type is generic. We cast via `any` once
// here so handlers never need to deal with the cast themselves.
//
// Claims available from Cognito access token:
//   sub      — unique user ID (use as userId/PK in DynamoDB)
//   email    — user's email address
//   username — Cognito username (don't use as PK — can change)
// =========================================================

const getClaims = (
  event: APIGatewayProxyEventV2
): Record<string, string> | undefined => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (event.requestContext as any)?.authorizer?.jwt?.claims;
};

// Returns Cognito sub — stable unique user ID across all identity providers
// Use this as userId and DynamoDB PK everywhere
export const getUserId = (event: APIGatewayProxyEventV2): string | undefined => {
  return getClaims(event)?.sub;
};

// Returns user email from JWT claims — always up to date from Cognito
// Do not accept email from request body — use this instead
export const getUserEmail = (event: APIGatewayProxyEventV2): string | undefined => {
  return getClaims(event)?.email;
};