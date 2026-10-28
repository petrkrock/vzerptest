import { Injectable } from '@nestjs/common';
import { DataAccess } from '../data-access';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class BuyersService extends DataAccess {
  constructor(db: DatabaseService) {
    super(db);
  }
}
