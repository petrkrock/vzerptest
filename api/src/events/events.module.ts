import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EventLogService } from './event-log.service';
import { TicketService } from './ticket.service';
import { SseService } from './sse.service';
import { PgListenerService } from './pg-listener.service';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [EventLogService, TicketService, SseService, PgListenerService],
  exports: [EventLogService, TicketService, SseService],
})
export class EventsModule {}
