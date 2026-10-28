import { BadRequestException, Body, Controller, Get, Headers, Post, Query, Req } from '@nestjs/common';
import { PublicService } from './public.service';
import { Public } from '../auth/public.decorator';
import { PublicFormType } from './field-defs';

const TYPES: PublicFormType[] = ['supplier', 'buyer', 'ticket'];

function parseType(raw: unknown): PublicFormType {
  const t = String(raw || '') as PublicFormType;
  if (!TYPES.includes(t)) throw new BadRequestException('Неизвестный тип формы');
  return t;
}

// v1.33.1: публичные формы лидов. Контракт — 1:1 как у edge function public-form:
// GET /forms?type=…, POST /forms {type, …} — embed.js и PublicFormPage не менялись.
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
