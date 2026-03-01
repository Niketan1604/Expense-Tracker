import { Logger } from '@aws-lambda-powertools/logger';

// =========================================================
// Benefits over console.log:
//   - Async — non-blocking
//   - Structured JSON — CloudWatch Logs Insights can query it
//   - Captures cold start, requestId, function name automatically
//   - Integrates with X-Ray tracing (Tracing: Active in template.yaml)
//   - Log sampling on prod — log only % of requests to save costs
// =========================================================
export const createLogger = (service: string): Logger => {
  return new Logger({ serviceName: service });
};