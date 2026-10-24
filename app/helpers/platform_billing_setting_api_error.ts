import { PLATFORM_BILLING_SETTING_ERROR_CODES } from '../constants/platform_billing_setting_error_codes.js'

export type PlatformBillingSettingOperation = 'show' | 'update' | 'history'

export type ResolvedPlatformBillingSettingError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

const TITLES: Record<PlatformBillingSettingOperation, { title: string; key: string }> = {
  show: {
    title: 'No fue posible obtener la configuración de cobro',
    key: 'no-fue-posible-obtener-la-configuracion-de-cobro',
  },
  update: {
    title: 'No fue posible guardar la configuración de cobro',
    key: 'no-fue-posible-guardar-la-configuracion-de-cobro',
  },
  history: {
    title: 'No fue posible obtener el historial de la configuración de cobro',
    key: 'no-fue-posible-obtener-el-historial-de-la-configuracion-de-cobro',
  },
}

const UNHANDLED_DETAIL =
  'Ocurrió un error inesperado. Intenta de nuevo; si continúa, contacta a soporte técnico.'

export function resolvePlatformBillingSettingApiError(
  error: unknown,
  operation: PlatformBillingSettingOperation
): ResolvedPlatformBillingSettingError {
  const { title, key } = TITLES[operation]
  const err = error as { code?: string; messages?: Array<{ message?: string }> }

  if (err?.code === 'E_VALIDATION_ERROR') {
    return {
      title,
      detail: err.messages?.[0]?.message ?? 'Datos inválidos.',
      key,
      code: PLATFORM_BILLING_SETTING_ERROR_CODES.VAL_INPUT,
      status: 422,
    }
  }

  // Nunca devolver el mensaje crudo por seguridad (evita exponer consultas SQL)
  return {
    title,
    detail: UNHANDLED_DETAIL,
    key,
    code: PLATFORM_BILLING_SETTING_ERROR_CODES.SYS_UNHANDLED,
    status: 500,
  }
}