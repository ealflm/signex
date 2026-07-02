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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CatalogService } from './catalog.service';
import type { AuthedUser } from '../auth/auth.types';

const localizedText = z.object({ en: z.string(), vi: z.string() });

const categoryBody = z.object({
  expectedRevision: z.number().int().min(0),
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
  expectedRevision: z.number().int().min(0),
  slug: z.string().min(1),
  title: localizedText,
  tag: localizedText,
  desc: localizedText,
  imageId: z.string().optional().nullable(),
  imageAlt: localizedText.optional().nullable(),
});

const reorderBody = z.object({
  expectedRevision: z.number().int().min(0),
  order: z.array(z.string()),
});

const deleteBody = z.object({
  expectedRevision: z.number().int().min(0),
});

type CategoryBody = z.infer<typeof categoryBody>;
type ProductBody = z.infer<typeof productBody>;
type ReorderBody = z.infer<typeof reorderBody>;
type DeleteBody = z.infer<typeof deleteBody>;

/**
 * The GLOBAL catalog — one live catalog for the whole site, edited independently
 * of any theme. Every write is immediately live (no draft/publish/release), so
 * reads return the live catalog and writes mutate it in place, optimistic-locked
 * on the catalog's `revision`.
 */
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // ── Reads ──────────────────────────────────────────────────────────────────

  /** The live catalog (categories + revision) for the admin editor. */
  @Get()
  @Roles('EDITOR')
  getCatalog() {
    return this.catalog.getCatalog();
  }

  @Get('categories')
  @Roles('EDITOR')
  listCategories() {
    return this.catalog.listCategories();
  }

  @Get('products')
  @Roles('EDITOR')
  listProducts() {
    return this.catalog.listProducts();
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  @Post('categories')
  @Roles('EDITOR')
  createCategory(
    @Body(new ZodValidationPipe(categoryBody)) body: CategoryBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    const { expectedRevision, ...input } = body;
    return this.catalog.createCategory(actor, expectedRevision, input);
  }

  // NOTE: /categories/reorder must be declared before /categories/:id so NestJS
  // matches the static segment "reorder" before the dynamic :id param.
  @Patch('categories/reorder')
  @Roles('EDITOR')
  reorderCategories(
    @Body(new ZodValidationPipe(reorderBody)) body: ReorderBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    return this.catalog.reorderCategories(
      actor,
      body.expectedRevision,
      body.order,
    );
  }

  @Patch('categories/:id')
  @Roles('EDITOR')
  updateCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(categoryBody)) body: CategoryBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    const { expectedRevision, ...input } = body;
    return this.catalog.updateCategory(actor, id, expectedRevision, input);
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

  @Post('categories/:categoryId/products')
  @Roles('EDITOR')
  createProduct(
    @Param('categoryId') categoryId: string,
    @Body(new ZodValidationPipe(productBody)) body: ProductBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    const { expectedRevision, ...input } = body;
    return this.catalog.createProduct(
      actor,
      categoryId,
      expectedRevision,
      input,
    );
  }

  // NOTE: /products/reorder before /products/:pid for the same static-before-dynamic reason.
  @Patch('categories/:categoryId/products/reorder')
  @Roles('EDITOR')
  reorderProducts(
    @Param('categoryId') categoryId: string,
    @Body(new ZodValidationPipe(reorderBody)) body: ReorderBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    return this.catalog.reorderProducts(
      actor,
      categoryId,
      body.expectedRevision,
      body.order,
    );
  }

  @Patch('categories/:categoryId/products/:pid')
  @Roles('EDITOR')
  updateProduct(
    @Param('categoryId') categoryId: string,
    @Param('pid') pid: string,
    @Body(new ZodValidationPipe(productBody)) body: ProductBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    const { expectedRevision, ...input } = body;
    return this.catalog.updateProduct(
      actor,
      categoryId,
      pid,
      expectedRevision,
      input,
    );
  }

  @Delete('categories/:categoryId/products/:pid')
  @Roles('EDITOR')
  deleteProduct(
    @Param('categoryId') categoryId: string,
    @Param('pid') pid: string,
    @Body(new ZodValidationPipe(deleteBody)) body: DeleteBody,
    @CurrentUser() actor: AuthedUser,
  ) {
    return this.catalog.deleteProduct(
      actor,
      categoryId,
      pid,
      body.expectedRevision,
    );
  }
}
