import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { AuthService } from '../auth.service';
import type { AuthedUser } from '../auth.types';
import { SESSION_COOKIE } from './origin.guard';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<
        Request & { cookies?: Record<string, string>; user?: AuthedUser }
      >();
    const cookieTok = req.cookies?.[SESSION_COOKIE];
    const authz = req.headers.authorization;
    const bearer = authz?.startsWith('Bearer ') ? authz.slice(7) : undefined;
    const raw = cookieTok ?? bearer;
    if (!raw) throw new UnauthorizedException('Not authenticated');

    const user = await this.auth.validateSessionToken(raw);
    if (!user) throw new UnauthorizedException('Invalid session');
    req.user = user;
    return true;
  }
}
