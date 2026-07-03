// apps/api/src/analytics/analytics.module.ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CollectController } from "./collect.controller";
import { IngestService } from "./ingest.service";

@Module({
  imports: [PrismaModule],
  controllers: [CollectController],
  providers: [IngestService],
  exports: [IngestService],
})
export class AnalyticsModule {}
