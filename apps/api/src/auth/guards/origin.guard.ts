import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

export const SESSION_COOKIE = 'sx_session';
export const ALLOWED_ORIGINS = 'AUTH_ALLOWED_ORIGINS';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ALLOWED_ORIGINS) private readonly allowed: string[],
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = req.headers.origin;
    // Server-to-server (admin route handler) sends no browser Origin -> allow.
    if (!origin) return true;
    if (this.allowed.includes(origin)) return true;
    throw new ForbiddenException('Origin not allowed');
  }
}
