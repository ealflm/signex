import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from '@signex/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CatalogService } from './catalog.service';
import type { AuthedUser } from '../auth/auth.types';

const localizedText = z.object({ en: z.string(), vi: z.string() });

const categoryBody = z.object({
  expectedDraftRevision: z.number().int().min(0),
  slug: z.string().min(1),
  title: localizedText,
  tag: localizedText,
  intro: localizedText,
  productCount: z.number().int(),
  materialCount: z.number().int(),
  imageId: z.string().optional().nullable(),
  imageAlt: localizedText.optional().nullable(),
});

const productBody = z.object({
  expectedDraftRevision: z.number().int().min(0),
  slug: z.string().min(1),
  title: localizedText,
  tag: localizedText,
  desc: localizedText,
  imageId: z.string().optional().nullable(),
  imageAlt: localizedText.optional().nullable(),
});

const reorderBody = z.object({
  expectedDraftRevision: z.number().int().min(0),
  order: z.array(z.string()),
});

const deleteBody = z.object({
  expectedDraftRevision: z.number().int().min(0),
});

type CategoryBody = z.infer<typeof categoryBody>;
type ProductBody = z.infer<typeof productBody>;
type ReorderBody = z.infer<typeof reorderBody>;
type DeleteBody = z.infer<typeof deleteBody>;

@Controller('themes/:themeId/catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // ── Categories ─────────────────────────────────────────────────────────────

  @Post('categories')
  @Roles('EDITOR')
  createCategory(
    @Param('themeId') themeId: string,
    @Body(new ZodValidationPipe(categoryBody)) body: CategoryBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    const { expectedDraftRevision, ...input } = body;
    return this.catalog.createCategory(actor, themeId, expectedDraftRevision, input);
  }

  // NOTE: /categories/reorder must be declared before /categories/:id so NestJS
  // matches the static segment "reorder" before the dynamic :id param.
  @Patch('categories/reorder')
  @Roles('EDITOR')
  reorderCategories(
    @Param('themeId') themeId: string,
    @Body(new ZodValidationPipe(reorderBody)) body: ReorderBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    return this.catalog.reorderCategories(
      actor,
      themeId,
      body.expectedDraftRevision,
      body.order,
    );
  }

  @Patch('categories/:id')
  @Roles('EDITOR')
  updateCategory(
    @Param('themeId') themeId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(categoryBody)) body: CategoryBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    const { expectedDraftRevision, ...input } = body;
    return this.catalog.updateCategory(actor, themeId, id, expectedDraftRevision, input);
  }

  @Delete('categories/:id')
  @Roles('EDITOR')
  deleteCategory(
    @Param('themeId') themeId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(deleteBody)) body: DeleteBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    return this.catalog.deleteCategory(actor, themeId, id, body.expectedDraftRevision);
  }

  // ── Products ───────────────────────────────────────────────────────────────

  @Post('categories/:categoryId/products')
  @Roles('EDITOR')
  createProduct(
    @Param('themeId') themeId: string,
    @Param('categoryId') categoryId: string,
    @Body(new ZodValidationPipe(productBody)) body: ProductBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    const { expectedDraftRevision, ...input } = body;
    return this.catalog.createProduct(actor, themeId, categoryId, expectedDraftRevision, input);
  }

  // NOTE: /products/reorder before /products/:pid for the same static-before-dynamic reason.
  @Patch('categories/:categoryId/products/reorder')
  @Roles('EDITOR')
  reorderProducts(
    @Param('themeId') themeId: string,
    @Param('categoryId') categoryId: string,
    @Body(new ZodValidationPipe(reorderBody)) body: ReorderBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    return this.catalog.reorderProducts(
      actor,
      themeId,
      categoryId,
      body.expectedDraftRevision,
      body.order,
    );
  }

  @Patch('categories/:categoryId/products/:pid')
  @Roles('EDITOR')
  updateProduct(
    @Param('themeId') themeId: string,
    @Param('categoryId') categoryId: string,
    @Param('pid') pid: string,
    @Body(new ZodValidationPipe(productBody)) body: ProductBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    const { expectedDraftRevision, ...input } = body;
    return this.catalog.updateProduct(
      actor,
      themeId,
      categoryId,
      pid,
      expectedDraftRevision,
      input,
    );
  }

  @Delete('categories/:categoryId/products/:pid')
  @Roles('EDITOR')
  deleteProduct(
    @Param('themeId') themeId: string,
    @Param('categoryId') categoryId: string,
    @Param('pid') pid: string,
    @Body(new ZodValidationPipe(deleteBody)) body: DeleteBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    return this.catalog.deleteProduct(
      actor,
      themeId,
      categoryId,
      pid,
      body.expectedDraftRevision,
    );
  }
}
