import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthedUser } from '../../auth/auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedUser | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthedUser }>();
    return req.user;
  },
);
