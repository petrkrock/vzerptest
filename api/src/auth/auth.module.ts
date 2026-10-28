import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthUsersController } from './users.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, AuthUsersController],
  providers: [
    AuthService,
    // Глобальный guard: всё закрыто по умолчанию, публичное помечается @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
