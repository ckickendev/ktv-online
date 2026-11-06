import { Response } from 'express';
import { ApiResponse, ApiErrorResponse, ApiErrorDetail } from '@ktv/contracts';

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Request successful',
  statusCode = 200
): Response<ApiResponse<T>> {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

export function sendError(
  res: Response,
  message = 'Something went wrong',
  statusCode = 500,
  errors?: ApiErrorDetail[]
): Response<ApiErrorResponse> {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors && errors.length > 0 ? { errors } : {}),
  });
}
