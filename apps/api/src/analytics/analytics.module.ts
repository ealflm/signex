// apps/api/src/analytics/analytics.module.ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AnalyticsController } from "./analytics.controller";
import { CollectController } from "./collect.controller";
import { IngestService } from "./ingest.service";
import { QueryService } from "./query.service";

@Module({
  imports: [PrismaModule],
  controllers: [CollectController, AnalyticsController],
  providers: [IngestService, QueryService],
  exports: [IngestService],
})
export class AnalyticsModule {}
