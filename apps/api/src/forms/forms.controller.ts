import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { z } from '@signex/shared';
import {
  FormsService,
  UPLOAD_MAX_BYTES,
  type ListResult,
  type PublicSubmission,
  type SummaryResult,
} from './forms.service';
import { submitSchema, type SubmitInput } from './dto/forms.dto';

const patchStatusSchema = z.object({
  status: z.enum(['NEW', 'READ', 'ARCHIVED']),
});

@Controller('forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  /** GET /api/forms — list submissions (EDITOR+). */
  @Get()
  @Roles('EDITOR')
  list(
    @Query('status') status?: string,
    @Query('formKey') formKey?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('order') order?: string,
  ): Promise<ListResult> {
    return this.forms.list({
      status: status as 'NEW' | 'READ' | 'ARCHIVED' | undefined,
      formKey: formKey as 'quote' | 'contact' | undefined,
      take: take !== undefined ? parseInt(take, 10) : undefined,
      skip: skip !== undefined ? parseInt(skip, 10) : undefined,
      order: order === 'asc' ? 'asc' : order === 'desc' ? 'desc' : undefined,
    });
  }

  /** GET /api/forms/summary — dashboard metrics (EDITOR+). */
  @Get('summary')
  @Roles('EDITOR')
  summary(): Promise<SummaryResult> {
    return this.forms.summary();
  }

  /** GET /api/forms/:id — single submission with resolved attachment (EDITOR+).
   *  Declared AFTER /summary so the literal route wins the match. */
  @Get(':id')
  @Roles('EDITOR')
  get(@Param('id') id: string): Promise<PublicSubmission> {
    return this.forms.get(id);
  }

  /** PATCH /api/forms/:id — update status (EDITOR+). */
  @Patch(':id')
  @Roles('EDITOR')
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(patchStatusSchema))
    body: { status: 'NEW' | 'READ' | 'ARCHIVED' },
  ): Promise<PublicSubmission> {
    return this.forms.setStatus(id, body.status);
  }

  /** POST /api/forms/:formKey/submit — public form submission. */
  @Post(':formKey/submit')
  @Public()
  @UseInterceptors(
    FileInterceptor('upload', {
      storage: memoryStorage(),
      // Reject oversized uploads BEFORE fully buffering into memory (DoS guard).
      // Same constant as the service-layer cap so they can never drift.
      limits: { fileSize: UPLOAD_MAX_BYTES },
    }),
  )
  async submit(
    @Param('formKey') formKey: string,
    @Body(new ZodValidationPipe(submitSchema)) body: SubmitInput,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    // x-forwarded-for may be "client, proxy1, proxy2" — take only the first (client) value.
    const xff = req.headers['x-forwarded-for'] as string | undefined;
    const ip = xff?.split(',')[0]?.trim() ?? req.ip ?? null;
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
    return this.forms.submit(formKey, body, file ?? null, ip, userAgent);
  }
}
