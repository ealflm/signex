import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UsePipes,
} from '@nestjs/common';
import { createUserSchema, z, type RoleName } from '@signex/shared';
import { Roles } from '../common/decorators/roles.decorator';
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
  email: string;
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

  @Post()
  @UsePipes(new ZodValidationPipe(createUserSchema))
  create(@Body() body: CreateBody): Promise<AuthedUser> {
    return this.users.create(body);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateUserSchema))
  update(
    @Param('id') id: string,
    @Body() body: UpdateBody,
  ): Promise<AuthedUser> {
    return this.users.update(id, body);
  }

  @Delete(':id')
  deactivate(@Param('id') id: string): Promise<AuthedUser> {
    return this.users.deactivate(id);
  }
}
