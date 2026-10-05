import env from '#start/env'

export type StripeMode = 'test' | 'live'

export type StripeVariable =
  | 'STRIPE_SECRET_KEY'
  | 'STRIPE_PUBLISHABLE_KEY'
  | 'STRIPE_WEBHOOK_SECRET'

export interface StripeRawSettings {
  secretKey?: string
  publishableKey?: string
  webhookSecret?: string
  nodeEnv: 'development' | 'production' | 'test'
}

export interface StripeSettingWarning {
  variable: StripeVariable
  problem: 'invalid-shape' | 'mode-mismatch' | 'live-outside-production'
}

export type StripeSettings =
  | {
      status: 'enabled'
      mode: StripeMode
      secretKey: string
      publishableKey: string | null
      webhookSecret: string | null
    }
  | {
      status: 'disabled'
      reason: 'missing-secret' | 'invalid-shape' | 'mode-mismatch' | 'live-outside-production'
      warnings: StripeSettingWarning[]
    }

export type StripeProviderDescription =
  | {
      status: 'enabled'
      mode: StripeMode
      publishableKey: 'configurada' | 'ausente'
      webhookSecret: 'configurada' | 'ausente'
    }
  | {
      status: 'disabled'
      reason: Extract<StripeSettings, { status: 'disabled' }>['reason']
      warnings: StripeSettingWarning[]
    }

const SECRET_KEY_PATTERN = /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/
const PUBLISHABLE_KEY_PATTERN = /^pk_(test|live)_[A-Za-z0-9]+$/
const WEBHOOK_SECRET_PATTERN = /^whsec_[A-Za-z0-9]+$/

export function readStripeRawSettings(): StripeRawSettings {
  return {
    secretKey: env.get('STRIPE_SECRET_KEY'),
    publishableKey: env.get('STRIPE_PUBLISHABLE_KEY'),
    webhookSecret: env.get('STRIPE_WEBHOOK_SECRET'),
    nodeEnv: env.get('NODE_ENV'),
  }
}

function secretMode(secretKey: string): StripeMode {
  return secretKey.includes('_live_') ? 'live' : 'test'
}

function publishableMode(publishableKey: string): StripeMode {
  return publishableKey.includes('_live_') ? 'live' : 'test'
}

export function resolveStripeSettings(raw: StripeRawSettings): StripeSettings {
  const warnings: StripeSettingWarning[] = []

  if (raw.secretKey !== undefined && !SECRET_KEY_PATTERN.test(raw.secretKey)) {
    warnings.push({ variable: 'STRIPE_SECRET_KEY', problem: 'invalid-shape' })
  }
  if (raw.publishableKey !== undefined && !PUBLISHABLE_KEY_PATTERN.test(raw.publishableKey)) {
    warnings.push({ variable: 'STRIPE_PUBLISHABLE_KEY', problem: 'invalid-shape' })
  }
  if (raw.webhookSecret !== undefined && !WEBHOOK_SECRET_PATTERN.test(raw.webhookSecret)) {
    warnings.push({ variable: 'STRIPE_WEBHOOK_SECRET', problem: 'invalid-shape' })
  }

  if (warnings.length > 0) {
    return { status: 'disabled', reason: 'invalid-shape', warnings }
  }

  if (raw.secretKey === undefined) {
    return { status: 'disabled', reason: 'missing-secret', warnings: [] }
  }

  const mode = secretMode(raw.secretKey)

  if (
    raw.publishableKey !== undefined &&
    publishableMode(raw.publishableKey) !== mode
  ) {
    return {
      status: 'disabled',
      reason: 'mode-mismatch',
      warnings: [{ variable: 'STRIPE_PUBLISHABLE_KEY', problem: 'mode-mismatch' }],
    }
  }

  if (mode === 'live' && raw.nodeEnv !== 'production') {
    return {
      status: 'disabled',
      reason: 'live-outside-production',
      warnings: [{ variable: 'STRIPE_SECRET_KEY', problem: 'live-outside-production' }],
    }
  }

  return {
    status: 'enabled',
    mode,
    secretKey: raw.secretKey,
    publishableKey: raw.publishableKey ?? null,
    webhookSecret: raw.webhookSecret ?? null,
  }
}

export function toStripeProviderDescription(settings: StripeSettings): StripeProviderDescription {
  if (settings.status === 'disabled') {
    return {
      status: 'disabled',
      reason: settings.reason,
      warnings: settings.warnings,
    }
  }

  return {
    status: 'enabled',
    mode: settings.mode,
    publishableKey: settings.publishableKey ? 'configurada' : 'ausente',
    webhookSecret: settings.webhookSecret ? 'configurada' : 'ausente',
  }
}

export function buildStripeStartupLog(description: StripeProviderDescription): {
  level: 'info' | 'warn'
  fields: Record<string, unknown>
  message: string
} {
  if (description.status === 'enabled') {
    const message =
      description.mode === 'test'
        ? 'Cobro: Stripe en modo de prueba'
        : 'Cobro: Stripe en modo en vivo'

    return {
      level: 'info',
      message,
      fields: {
        provider: 'stripe',
        mode: description.mode,
        publishableKey: description.publishableKey,
        webhookSecret: description.webhookSecret,
      },
    }
  }

  if (description.warnings.length === 0) {
    return {
      level: 'info',
      message: 'Cobro: Stripe sin llaves; solo cobro manual',
      fields: { provider: 'stripe', reason: description.reason },
    }
  }

  return {
    level: 'warn',
    message: 'Cobro: Stripe deshabilitado por configuración inválida',
    fields: {
      provider: 'stripe',
      reason: description.reason,
      warnings: description.warnings,
    },
  }
}
