import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { prisma, type PrismaClient } from '@signex/db';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly client: PrismaClient = prisma;

  async onModuleInit(): Promise<void> {
    try {
      await this.client.$connect();
    } catch (err) {
      // Scaffold: don't hard-crash the API if the DB is unreachable at boot
      // (e.g. running the e2e without a database). The connection is exercised
      // for real against the Postgres container in Task 13.
      this.logger.warn(
        `Prisma $connect failed at boot (continuing): ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
