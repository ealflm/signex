import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { FormsService, UPLOAD_MAX_BYTES } from './forms.service';
import { submitSchema, type SubmitInput } from './dto/forms.dto';

@Controller('forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

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
