import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { MIME_ALLOWLIST } from '../assets/dto/assets.dto';
import { SYSTEM_USER_ID } from '../auth/seed-config';
import {
  VALID_FORM_KEYS,
  type FormKey,
  type SubmitInput,
} from './dto/forms.dto';

/** File upload size cap for form attachments (10 MB). Exported so the multer
 *  interceptor can share the same constant and they can never drift. */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** MIME types accepted on the forms upload field (images / SVG only).
 *  Video types in MIME_ALLOWLIST are NOT accepted here. */
export const FORMS_IMAGE_MIMES = new Set(
  Object.keys(MIME_ALLOWLIST).filter((m) => m.startsWith('image/')),
);

@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
  ) {}

  async submit(
    formKey: string,
    payload: SubmitInput,
    file: Express.Multer.File | null,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{ ok: true }> {
    // 1. Validate formKey
    if (!(VALID_FORM_KEYS as readonly string[]).includes(formKey)) {
      throw new NotFoundException(`Unknown form: ${formKey}`);
    }

    // 2. Handle optional file upload
    let uploadAssetId: string | null = null;
    if (file) {
      if (!FORMS_IMAGE_MIMES.has(file.mimetype)) {
        throw new BadRequestException(
          `File type ${file.mimetype} is not accepted; images only`,
        );
      }
      if (file.buffer.length > UPLOAD_MAX_BYTES) {
        throw new BadRequestException(
          `File too large (max ${UPLOAD_MAX_BYTES} bytes)`,
        );
      }
      const assetDto = await this.assets.register(
        { id: SYSTEM_USER_ID, role: 'ADMIN' },
        {
          bytes: file.buffer,
          mime: file.mimetype,
          originalName: file.originalname,
        },
      );
      uploadAssetId = assetDto.id;
    }

    // 3. Persist the submission
    await this.prisma.client.formSubmission.create({
      data: {
        formKey: formKey as FormKey,
        payload: payload as object,
        uploadAssetId,
        ip,
        userAgent,
      },
    });

    return { ok: true };
  }
}
