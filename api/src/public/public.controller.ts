import { Body, Controller, Get, Headers, Post, Query, Req } from '@nestjs/common';
import { PublicService, fail } from './public.service';
import { Public } from '../auth/public.decorator';
import { PublicFormType } from './field-defs';

const TYPES: PublicFormType[] = ['supplier', 'buyer', 'ticket'];

function parseType(raw: unknown): PublicFormType {
  const t = String(raw || '') as PublicFormType;
  if (!TYPES.includes(t)) throw fail('Неизвестный тип формы');
  return t;
}

// Публичные формы. Контракт — как у edge function public-form (v1.31.18):
// GET /forms?type=…, POST /forms {type, values, consent, honeypot, renderedAt}.
// Без JWT (публичные), rate-limit и антибот внутри сервиса.
@Controller('forms')
export class PublicController {
  constructor(private forms: PublicService) {}

  @Public()
  @Get()
  config(@Query('type') type: string) {
    return this.forms.getConfig(parseType(type));
  }

  @Public()
  @Post()
  submit(
    @Body() body: Record<string, unknown>,
    @Req() req: { headers: Record<string, string | undefined>; ip?: string },
    @Headers('content-length') contentLength?: string,
  ) {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
    return this.forms.submit(
      parseType(body?.type),
      body,
      ip,
      contentLength ? Number(contentLength) : undefined,
    );
  }
}
