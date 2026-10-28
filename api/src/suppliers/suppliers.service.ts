import { Injectable } from '@nestjs/common';
import { DataAccess } from '../data-access';
import { DatabaseService } from '../database/database.service';

// Тонкий сервис: вся работа с RLS — в DataAccess (api/src/data-access.ts).
@Injectable()
export class SuppliersService extends DataAccess {
  constructor(db: DatabaseService) {
    super(db);
  }
}
