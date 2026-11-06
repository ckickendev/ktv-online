import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { userService } from './user.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { CreateUserDto } from '@ktv/contracts';

export class UserController {
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.params.id;
      if (!userId || !Types.ObjectId.isValid(userId)) {
        sendError(res, 'User not found', 404);
        return;
      }

      const user = await userService.findById(userId);
      if (!user) {
        sendError(res, 'User not found', 404);
        return;
      }

      sendSuccess(res, user.toJSON(), 'User retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body as CreateUserDto;

      const existingEmail = await userService.findByEmail(data.email);
      if (existingEmail) {
        sendError(res, 'Email is already registered', 409);
        return;
      }

      const existingUsername = await userService.findByUsername(data.username);
      if (existingUsername) {
        sendError(res, 'Username is already taken', 409);
        return;
      }

      const newUser = await userService.create(data);
      sendSuccess(res, newUser.toJSON(), 'User created successfully', 201);
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
