import { Transaction } from "../transaction/model";

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


export const response = <T>(data: T) => ({
  statusCode: STATUS.OK,
  body: JSON.stringify({
    status: STATUS.OK,
    data,
    message: null
  })
});

export const created = <T>(data: T) => ({
  statusCode: STATUS.CREATED,
  body: JSON.stringify({
    status: STATUS.CREATED,
    data,
    message: null
  })
});

export const error = (statusCode: number, message: string) => ({
  statusCode,
  body: JSON.stringify({
    status: statusCode,
    data: null,
    message
  })
});

export const stripKeys = (item: Record<string, unknown>): Transaction => {
    const { PK: _PK, SK: _SK, GSI1PK: _GSI1PK, GSI1SK: _GSI1SK, GSI2PK: _GSI2PK, GSI2SK: _GSI2SK, ...response } = item;
    return response as unknown as Transaction;
};