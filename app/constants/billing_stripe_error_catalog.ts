import {
  STRIPE_CODE_ENTRY,
  STRIPE_DECLINE_CODE_ENTRY,
  type KnownStripeErrorCode,
  type StripeDeclineCode,
} from './billing_stripe_error_codes.js'

export type StripeErrorAction = 'tenant' | 'valanserh'

export interface StripeErrorCatalogEntry {
  key: string
  title: string
  detail: string
  action: StripeErrorAction
}

export const BILLING_STRIPE_ERROR_ENTRIES = {
  'tarjeta-rechazada-por-el-banco': {
    key: 'tarjeta-rechazada-por-el-banco',
    title: 'Tu banco rechazó el cargo',
    detail:
      'Tu banco rechazó el cargo sin indicar el motivo. Comunícate con tu banco o registra otra tarjeta en Mi suscripción.',
    action: 'tenant',
  },
  'tarjeta-sin-fondos-suficientes': {
    key: 'tarjeta-sin-fondos-suficientes',
    title: 'La tarjeta no tiene fondos suficientes',
    detail:
      'La tarjeta no tiene saldo o crédito suficiente para este cargo. Registra otra tarjeta o comunícate con tu banco.',
    action: 'tenant',
  },
  'tarjeta-vencida': {
    key: 'tarjeta-vencida',
    title: 'La tarjeta está vencida',
    detail: 'La tarjeta que registraste ya venció. Registra una tarjeta vigente en Mi suscripción.',
    action: 'tenant',
  },
  'datos-de-la-tarjeta-incorrectos': {
    key: 'datos-de-la-tarjeta-incorrectos',
    title: 'Revisa los datos de la tarjeta',
    detail:
      'El número, la fecha de vencimiento o el código de seguridad no coinciden. Revísalos y vuelve a intentarlo.',
    action: 'tenant',
  },
  'direccion-de-facturacion-incorrecta': {
    key: 'direccion-de-facturacion-incorrecta',
    title: 'Revisa la dirección de la tarjeta',
    detail:
      'La dirección o el código postal no coinciden con los que tiene tu banco. Corrígelos y vuelve a intentarlo.',
    action: 'tenant',
  },
  'tarjeta-no-admite-este-cargo': {
    key: 'tarjeta-no-admite-este-cargo',
    title: 'Esta tarjeta no admite el cargo',
    detail:
      'Tu tarjeta no permite este tipo de cargo, este monto o esta moneda. Comunícate con tu banco o registra otra tarjeta.',
    action: 'tenant',
  },
  'confirmacion-del-banco-requerida': {
    key: 'confirmacion-del-banco-requerida',
    title: 'Tu banco pide confirmar el cargo',
    detail:
      'Tu banco pide que confirmes este cargo. Vuelve a registrar la tarjeta en Mi suscripción y completa la verificación que te muestre tu banco.',
    action: 'tenant',
  },
  'banco-no-disponible': {
    key: 'banco-no-disponible',
    title: 'Tu banco no respondió',
    detail:
      'No fue posible comunicarnos con tu banco en este momento. Intenta de nuevo en unos minutos; si se repite, comunícate con tu banco.',
    action: 'tenant',
  },
  'demasiados-intentos-con-la-tarjeta': {
    key: 'demasiados-intentos-con-la-tarjeta',
    title: 'Demasiados intentos con esta tarjeta',
    detail:
      'Hubo varios intentos seguidos con esta tarjeta y tu banco la bloqueó temporalmente. Espera un rato o registra otra tarjeta.',
    action: 'tenant',
  },
  'cargo-duplicado-reciente': {
    key: 'cargo-duplicado-reciente',
    title: 'Ya hay un cargo igual reciente',
    detail:
      'Tu banco detectó un cargo igual hace muy poco. Revisa tus movimientos antes de intentarlo de nuevo.',
    action: 'tenant',
  },
  'tarjeta-de-prueba-no-valida': {
    key: 'tarjeta-de-prueba-no-valida',
    title: 'Se usó una tarjeta de prueba',
    detail: 'La tarjeta es de prueba y no sirve para cargos reales. Registra una tarjeta real.',
    action: 'tenant',
  },
  'metodo-de-pago-rechazado': {
    key: 'metodo-de-pago-rechazado',
    title: 'El método de pago fue rechazado',
    detail:
      'El proveedor de este método de pago rechazó el cargo. Usa otro método o comunícate con tu banco.',
    action: 'tenant',
  },
  'cobro-restringido-por-el-procesador': {
    key: 'cobro-restringido-por-el-procesador',
    title: 'No pudimos procesar el cargo',
    detail:
      'El cargo no se procesó por una restricción de nuestra cuenta con el procesador de pagos; no es un problema de tu tarjeta. Nuestro equipo ya fue avisado.',
    action: 'valanserh',
  },
  'procesador-de-pagos-ocupado': {
    key: 'procesador-de-pagos-ocupado',
    title: 'El procesador de pagos está ocupado',
    detail:
      'El procesador de pagos no pudo atender la operación en este momento. Intenta de nuevo en unos minutos.',
    action: 'tenant',
  },
  'fallo-del-proveedor-de-cobro': {
    key: 'fallo-del-proveedor-de-cobro',
    title: 'No pudimos completar la operación',
    detail:
      'No pudimos completar la operación con el procesador de pagos por un problema de nuestro lado. Ya quedó registrado; si se repite, contacta a soporte.',
    action: 'valanserh',
  },
} as const satisfies Record<string, StripeErrorCatalogEntry>

export type StripeErrorEntryKey = keyof typeof BILLING_STRIPE_ERROR_ENTRIES

/** docs.stripe.com/declines/codes — consultada 2026-10-13 */
export const STRIPE_DECLINE_CODES = Object.keys(STRIPE_DECLINE_CODE_ENTRY) as StripeDeclineCode[]

/** Regla 4: nunca revelar el motivo al tenant. */
export const STRIPE_SENSITIVE_DECLINE_CODES = new Set<string>([
  'fraudulent',
  'lost_card',
  'stolen_card',
  'merchant_blacklist',
  'pickup_card',
  'restricted_card',
  'lost_or_stolen_card',
  'partner_high_risk_customer',
  'compliance_violation',
])

export type StripeErrorClassHint =
  | 'connection'
  | 'rate_limit'
  | 'authentication'
  | 'permission'
  | null

export interface StripeErrorResolveSignal {
  rawType: string | null | undefined
  code: string | null | undefined
  declineCode: string | null | undefined
  errorClass: StripeErrorClassHint
}

export interface ResolvedStripeErrorEntry {
  entry: StripeErrorCatalogEntry
  httpStatus: number
  catalogMiss: boolean
}

function entryForKey(key: StripeErrorEntryKey): StripeErrorCatalogEntry {
  return BILLING_STRIPE_ERROR_ENTRIES[key]
}

function normalizeDeclineCode(declineCode: string | null | undefined): string | null {
  if (declineCode === null || declineCode === undefined || declineCode === '') {
    return null
  }
  return declineCode
}

function normalizeCode(code: string | null | undefined): string | null {
  if (code === null || code === undefined || code === '') {
    return null
  }
  return code
}

function fallbackEntry(
  signal: StripeErrorResolveSignal,
  catalogMiss: boolean
): ResolvedStripeErrorEntry {
  const rawType = signal.rawType ?? null

  if (rawType === 'card_error') {
    return {
      entry: entryForKey('tarjeta-rechazada-por-el-banco'),
      httpStatus: 422,
      catalogMiss,
    }
  }

  if (
    rawType === 'api_error' ||
    signal.errorClass === 'connection' ||
    signal.errorClass === 'rate_limit'
  ) {
    return {
      entry: entryForKey('procesador-de-pagos-ocupado'),
      httpStatus: 500,
      catalogMiss,
    }
  }

  if (signal.errorClass === 'authentication' || signal.errorClass === 'permission') {
    return {
      entry: entryForKey('cobro-restringido-por-el-procesador'),
      httpStatus: 500,
      catalogMiss,
    }
  }

  return {
    entry: entryForKey('fallo-del-proveedor-de-cobro'),
    httpStatus: 500,
    catalogMiss,
  }
}

function resolveDeclineEntry(declineCode: string): StripeErrorEntryKey | null {
  if (!(declineCode in STRIPE_DECLINE_CODE_ENTRY)) {
    return null
  }
  if (STRIPE_SENSITIVE_DECLINE_CODES.has(declineCode)) {
    return 'tarjeta-rechazada-por-el-banco'
  }
  return STRIPE_DECLINE_CODE_ENTRY[declineCode as StripeDeclineCode] as StripeErrorEntryKey
}

function resolveCodeEntry(code: string): StripeErrorEntryKey | null {
  if (!(code in STRIPE_CODE_ENTRY)) {
    return null
  }
  return STRIPE_CODE_ENTRY[code as KnownStripeErrorCode] as StripeErrorEntryKey
}

/** Pura; precedencia anexo §5 y reglas R4/R6/R7. */
export function resolveStripeErrorEntry(signal: StripeErrorResolveSignal): ResolvedStripeErrorEntry {
  const declineCode = normalizeDeclineCode(signal.declineCode)
  const code = normalizeCode(signal.code)
  let catalogMiss = false

  if (declineCode !== null) {
    const declineKey = resolveDeclineEntry(declineCode)
    if (declineKey !== null) {
      const httpStatus = signal.rawType === 'card_error' ? 422 : 500
      return { entry: entryForKey(declineKey), httpStatus, catalogMiss: false }
    }
    catalogMiss = true
  }

  if (code !== null) {
    const codeKey = resolveCodeEntry(code)
    if (codeKey !== null) {
      const httpStatus = signal.rawType === 'card_error' ? 422 : 500
      return { entry: entryForKey(codeKey), httpStatus, catalogMiss: false }
    }
    catalogMiss = true
  } else if (declineCode !== null) {
    catalogMiss = true
  }

  return fallbackEntry(signal, catalogMiss)
}

export function stripeErrorEntryByKey(key: StripeErrorEntryKey): StripeErrorCatalogEntry {
  return entryForKey(key)
}
