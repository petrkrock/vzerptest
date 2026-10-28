import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EmailService } from './email.service';

// v1.32.5: почтовый воркер. Забирает события outbox_events с email-payload,
// шлёт через SMTP, отмечает статусы. Без @nestjs/schedule — обычный setInterval.
@Module({
  imports: [DatabaseModule],
  providers: [EmailService],
})
export class EmailModule {}
