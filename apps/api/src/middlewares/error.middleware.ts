import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { sendError } from '../utils/response.js';

export function errorHandler(
  err: Error & { statusCode?: number; code?: number },
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);

  logger.error(
    {
      err: {
        message: err.message,
        stack: err.stack,
        name: err.name,
      },
      method: req.method,
      path: req.originalUrl,
    },
    'Global error handler captured exception'
  );

  const isProduction = process.env.NODE_ENV === 'production';
  const message = isProduction && statusCode === 500 ? 'Internal Server Error' : err.message;

  sendError(res, message, statusCode);
}
