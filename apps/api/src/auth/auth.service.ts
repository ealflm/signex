import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPassword } from '../common/crypto/password';
import { generateSessionToken, hashToken } from '../common/crypto/token';
import { publicUser, type AuthedUser } from './auth.types';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day absolute (locked #10)

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(private readonly prisma: PrismaService) {}

  async login(
    email: string,
    password: string,
    ctx?: { ip?: string; userAgent?: string },
  ): Promise<{ user: AuthedUser; rawToken: string; expiresAt: Date }> {
    const user = await this.prisma.client.user.findUnique({
      where: { email },
    });
    // Verify even when the user is missing to keep timing ~constant (enum resistance).
    const hash =
      user?.passwordHash ??
      'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
    const ok = await verifyPassword(password, hash);
    if (!user || !user.isActive || !ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const rawToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.client.session.create({
      data: {
        tokenHash: hashToken(rawToken),
        userId: user.id,
        expiresAt,
        ip: ctx?.ip,
        userAgent: ctx?.userAgent,
      },
    });
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return { user: publicUser(user), rawToken, expiresAt };
  }

  async logout(rawToken: string): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async validateSessionToken(rawToken: string): Promise<AuthedUser | null> {
    if (!rawToken) return null;
    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    if (!session.user || !session.user.isActive) return null;
    await this.prisma.client.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
    return publicUser(session.user);
  }

  async cleanupExpiredSessions(): Promise<number> {
    try {
      const { count } = await this.prisma.client.session.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { revokedAt: { not: null } },
          ],
        },
      });
      return count;
    } catch (err) {
      this.logger.warn(`session cleanup skipped: ${(err as Error).message}`);
      return 0;
    }
  }
}
