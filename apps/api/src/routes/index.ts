import { Router } from 'express';
import { healthRoutes } from './health.routes.js';
import { userRoutes } from '../modules/users/user.routes.js';
import { roomRoutes } from '../modules/rooms/room.routes.js';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { chatRoutes } from '../modules/chat/chat.routes.js';

export const apiV1Router = Router();

apiV1Router.use('/', healthRoutes);
apiV1Router.use('/auth', authRoutes);
apiV1Router.use('/users', userRoutes);
apiV1Router.use('/rooms', roomRoutes);
apiV1Router.use('/', chatRoutes);
