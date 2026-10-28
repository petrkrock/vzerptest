import { Module } from '@nestjs/common';
import { CheckoController } from './checko.controller';

// v1.34.0: прокси checko.ru (было — edge function 'checko' из-за CORS).
// Ключ передаётся с фронта из настроек; API дергает checko сервер-сервер.
@Module({ controllers: [CheckoController] })
export class CheckoModule {}
