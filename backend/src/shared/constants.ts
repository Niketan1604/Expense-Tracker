// =========================================================
// HTTP Status Codes
// =========================================================
export const STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500
};

// =========================================================
// Response Helpers
//
// Two helpers — one for success, one for error.
// Consistent envelope shape across all APIs:
//
// Success: { status: 200, data: T,    message: null }
// Error:   { status: xxx, data: null, message: string }
// =========================================================

// Success response — always 200
export const response = <T>(data: T) => ({
  statusCode: STATUS.OK,
  body: JSON.stringify({
    status: STATUS.OK,
    data,
    message: null
  })
});

// Error response — caller provides status code + message
export const error = (statusCode: number, message: string) => ({
  statusCode,
  body: JSON.stringify({
    status: statusCode,
    data: null,
    message
  })
});