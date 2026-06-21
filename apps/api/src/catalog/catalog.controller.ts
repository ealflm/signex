import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from '@signex/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from './catalog.service';
import type { AuthedUser } from '../auth/auth.types';

const writeBody = z.object({
  input: z.unknown(),
  expectedRevision: z.number().int().nonnegative(),
});
const deleteBody = z.object({
  expectedRevision: z.number().int().nonnegative(),
});
type WriteBody = z.infer<typeof writeBody>;
type DeleteBody = z.infer<typeof deleteBody>;

@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly prisma?: PrismaService,
  ) {}

  // ── Categories ─────────────────────────────────────────────────────────────

  @Get('categories')
  @Roles('EDITOR')
  listCategories(): Promise<unknown[]> {
    return this.prisma!.client.category.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    }) as Promise<unknown[]>;
  }

  @Post('categories')
  @Roles('EDITOR')
  createCategory(
    @Body(new ZodValidationPipe(writeBody)) body: WriteBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    return this.catalog.createCategory(actor, body.input, body.expectedRevision);
  }

  @Patch('categories/:id')
  @Roles('EDITOR')
  updateCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(writeBody)) body: WriteBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    return this.catalog.updateCategory(actor, id, body.input, body.expectedRevision);
  }

  @Delete('categories/:id')
  @Roles('EDITOR')
  deleteCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(deleteBody)) body: DeleteBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    return this.catalog.deleteCategory(actor, id, body.expectedRevision);
  }

  // ── Products ───────────────────────────────────────────────────────────────

  @Get('products')
  @Roles('EDITOR')
  listProducts(): Promise<unknown[]> {
    return this.prisma!.client.product.findMany({
      where: { deletedAt: null },
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
    }) as Promise<unknown[]>;
  }

  @Post('products')
  @Roles('EDITOR')
  createProduct(
    @Body(new ZodValidationPipe(writeBody)) body: WriteBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    return this.catalog.createProduct(actor, body.input, body.expectedRevision);
  }

  @Patch('products/:id')
  @Roles('EDITOR')
  updateProduct(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(writeBody)) body: WriteBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    return this.catalog.updateProduct(actor, id, body.input, body.expectedRevision);
  }

  @Delete('products/:id')
  @Roles('EDITOR')
  deleteProduct(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(deleteBody)) body: DeleteBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    return this.catalog.deleteProduct(actor, id, body.expectedRevision);
  }
}
