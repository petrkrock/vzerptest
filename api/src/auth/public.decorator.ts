import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Помечает эндпоинт, доступный без JWT: логин, healthcheck, ЛК по токену.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
