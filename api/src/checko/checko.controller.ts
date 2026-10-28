import { Body, Controller, HttpCode, Post, BadGatewayException } from '@nestjs/common';

// Порт edge function «checko»: прозрачный прокси POST {key, inn} → api.checko.ru/v2/company.
// Формат ответа — как у checko (фронт парсит status/error/«Финансы» и т.д.).
@Controller('checko')
export class CheckoController {
  @HttpCode(200)
  @Post('lookup')
  async lookup(@Body() body: { key?: string; inn?: string }) {
    const key = String(body.key || '').trim();
    const inn = String(body.inn || '').trim();
    if (!key || !inn) throw new BadGatewayException('Нужны key и inn');
    try {
      const r = await fetch('https://api.checko.ru/v2/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, inn }),
      });
      return await r.json().catch(() => ({ status: 'error', error: `HTTP ${r.status}` }));
    } catch (e) {
      throw new BadGatewayException(`checko.ru недоступен: ${String(e).slice(0, 200)}`);
    }
  }
}
