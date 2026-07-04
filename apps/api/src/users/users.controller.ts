import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { createUserSchema, z, type RoleName } from '@signex/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';
import type { AuthedUser, PublicUserRow } from '../auth/auth.types';

// Patch schema: name/role/isActive are all optional.
const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['EDITOR', 'PUBLISHER', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
});

interface CreateBody {
  username: string;
  name: string;
  password: string;
  role: RoleName;
}
interface UpdateBody {
  name?: string;
  role?: RoleName;
  isActive?: boolean;
}

@Controller('users')
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll(): Promise<PublicUserRow[]> {
    return this.users.findAll();
  }

  // NOTE: the validation pipe is bound to @Body (not @UsePipes at the method level).
  // A method-level pipe also runs against @Param('id') — a bare string — and the
  // object schema rejects it with 422 ("expected object, received string"), silently
  // breaking every PATCH/POST that also takes a path param.
  @Post()
  create(
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateBody,
  ): Promise<AuthedUser> {
    return this.users.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateBody,
    @CurrentUser() user: AuthedUser,
  ): Promise<AuthedUser> {
    return this.users.update(id, body, user.id);
  }

  @Delete(':id')
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthedUser,
  ): Promise<AuthedUser> {
    return this.users.deactivate(id, user.id);
  }
}
