import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { loginSchema } from '@signex/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService, SESSION_TTL_MS } from './auth.service';
import { SESSION_COOKIE } from './guards/origin.guard';
import type { AuthedUser } from './auth.types';

interface LoginBody {
  email: string;
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() body: LoginBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthedUser }> {
    const { user, rawToken, expiresAt } = await this.auth.login(
      body.email,
      body.password,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
    res.cookie(SESSION_COOKIE, rawToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_MS,
      expires: expiresAt,
    });
    return { user };
  }

  @Post('logout')
  async logout(
    @Req() req: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const raw = req.cookies?.[SESSION_COOKIE];
    if (raw) await this.auth.logout(raw);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthedUser | undefined): { user: AuthedUser } {
    if (!user) throw new UnauthorizedException();
    return { user };
  }
}
