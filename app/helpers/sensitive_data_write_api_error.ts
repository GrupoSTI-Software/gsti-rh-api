import type { HttpContext } from '@adonisjs/core/http'
import type { LegalCategory } from '#constants/sensitive_fields'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'

export type SensitiveDataWriteDenialBody = {
  title: string
  detail: string
  key: string
  code: string
}

export function isSensitiveDataWriteError(error: unknown): error is SensitiveDataWriteError {
  return error instanceof SensitiveDataWriteError
}

function categoryLabel(ctx: HttpContext, category: LegalCategory): string {
  return ctx.i18n.t(`sensitive_data_write_category_${category}`)
}

export function respondSensitiveDataWriteDenial(
  ctx: HttpContext,
  error: SensitiveDataWriteError
): SensitiveDataWriteDenialBody {
  ctx.response.status(403)

  if (error.errorCode === SENSITIVE_DATA_WRITE_ERROR_CODES.UNRESOLVED) {
    return {
      title: ctx.i18n.t('sensitive_data_write_unresolved_title'),
      detail: ctx.i18n.t('sensitive_data_write_unresolved_detail'),
      key: 'no-se-pudo-determinar-el-permiso-de-escritura',
      code: error.errorCode,
    }
  }

  const category = error.category ?? 'identificacion'
  return {
    title: ctx.i18n.t('sensitive_data_write_forbidden_title'),
    detail: ctx.i18n.t('sensitive_data_write_forbidden_detail', {
      category: categoryLabel(ctx, category),
    }),
    key: 'sin-permiso-para-modificar-datos-sensibles',
    code: error.errorCode,
  }
}
