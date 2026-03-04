import { z } from 'zod';
import { STATUS, error } from './constants';

// =========================================================
// Validation Helpers
//
// Thin wrapper around Zod for use in Lambda handlers.
// All handlers follow the same pattern:
//
//   const body = parseBody(event.body, schema)
//   if ('statusCode' in body) return body   ← validation error
//   // body is now fully typed
// =========================================================

// ── Common field schemas ──────────────────────────────────

export const amountSchema = z
    .number({ invalid_type_error: 'amount must be a number' })
    .int('amount must be an integer (store in paise/cents)')
    .positive('amount must be greater than 0');

export const dateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in yyyy-mm-dd format');

export const monthSchema = z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'month must be in yyyy-mm format');

export const transactionTypeSchema = z.enum(['CREDIT', 'DEBIT'], {
    errorMap: () => ({ message: 'type must be CREDIT or DEBIT' })
});

// ── parseBody ─────────────────────────────────────────────
// Parses + validates event.body against a Zod schema.
// Returns typed data on success, or an error response on failure.
//
// Usage:
//   const body = parseBody(event.body, createTransactionSchema)
//   if ('statusCode' in body) return body
//   body.amount  ← fully typed here

export const parseBody = <T extends z.ZodTypeAny>(rawBody: string | null | undefined, schema: T): z.infer<T> | ReturnType<typeof error> => {
    if (!rawBody) {
        return error(STATUS.BAD_REQUEST, 'Request body is required');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(rawBody);
    } catch {
        return error(STATUS.BAD_REQUEST, 'Request body must be valid JSON');
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
        const message = result.error.errors
            .map(e => `${e.path.join('.') || 'body'}: ${e.message}`)
            .join(', ');
        return error(STATUS.BAD_REQUEST, message);
    }

    return result.data;
};

// ── parseQueryParams ──────────────────────────────────────
// Validates query string parameters against a Zod schema.
// Returns typed data on success, or an error response on failure.
//
// Usage:
//   const params = parseQueryParams(event.queryStringParameters, schema)
//   if ('statusCode' in params) return params

export const parseQueryParams = <T extends z.ZodTypeAny>(queryParams: Record<string, string | undefined> | undefined, schema: T): z.infer<T> | ReturnType<typeof error> => {
    const result = schema.safeParse(queryParams ?? {});
    if (!result.success) {
        const message = result.error.errors
            .map(e => `${e.path.join('.') || 'query'}: ${e.message}`)
            .join(', ');
        return error(STATUS.BAD_REQUEST, message);
    }
    return result.data;
};