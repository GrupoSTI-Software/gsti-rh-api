import {
  resolveStripeErrorEntry,
  STRIPE_SENSITIVE_DECLINE_CODES,
  type StripeErrorAction,
  type StripeErrorEntryKey,
} from '#constants/billing_stripe_error_catalog'
import { DateTime } from 'luxon'

export const STRIPE_SUPPORT_LIMIT_CODES = [
  'charge_exceeds_transaction_limit',
  'charge_exceeds_source_limit',
] as const

export type StripeSupportLimitCode = (typeof STRIPE_SUPPORT_LIMIT_CODES)[number]

export interface PaymentFailureMessage {
  title: string
  detail: string
  action: StripeErrorAction
}

export interface PaymentFailureResolution extends PaymentFailureMessage {
  key: StripeErrorEntryKey
  catalogMiss: boolean
  resolvedByStripeSupport: boolean
  sensitiveDecline: boolean
}

export type LastPaymentFailurePrevious = {
  invoiceRef: string | null
  code: string | null
}

export type LastPaymentFailureOutcome = {
  applied: boolean
  previous: LastPaymentFailurePrevious | null
}

function normalizeRawCode(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Resuelve el motivo legible de un cobro recurrente fallido (VLRH-H1791925352373).
 * Sin códigos crudos guardados devuelve null (VLRH-C0162 R6).
 */
export function resolvePaymentFailureMessage(input: {
  code: string | null
  declineCode: string | null
}): PaymentFailureResolution | null {
  const code = normalizeRawCode(input.code)
  const declineCode = normalizeRawCode(input.declineCode)

  if (code === null && declineCode === null) {
    return null
  }

  const resolved = resolveStripeErrorEntry({
    rawType: 'card_error',
    code,
    declineCode,
    errorClass: null,
  })

  const resolvedByStripeSupport =
    code !== null &&
    (STRIPE_SUPPORT_LIMIT_CODES as readonly string[]).includes(code)

  const sensitiveDecline =
    declineCode !== null && STRIPE_SENSITIVE_DECLINE_CODES.has(declineCode)

  return {
    key: resolved.entry.key as StripeErrorEntryKey,
    title: resolved.entry.title,
    detail: resolved.entry.detail,
    action: resolved.entry.action,
    catalogMiss: resolved.catalogMiss,
    resolvedByStripeSupport,
    sensitiveDecline,
  }
}

/**
 * Decide si enviar aviso interno post-webhook (Reglas 1 y 2 de la HU).
 */
export function shouldNotifyAccountIssue(
  outcome: LastPaymentFailureOutcome,
  current: { invoiceRef: string; code: string | null },
  resolution: PaymentFailureResolution | null
): boolean {
  if (!outcome.applied || resolution === null) {
    return false
  }
  if (resolution.catalogMiss || resolution.action !== 'valanserh') {
    return false
  }
  if (outcome.previous === null) {
    return true
  }
  return (
    outcome.previous.invoiceRef !== current.invoiceRef ||
    outcome.previous.code !== current.code
  )
}

export type LandlordLastPaymentFailure = {
  at: string
  active: boolean
  code: string | null
  declineCode: string | null
  key: string | null
  title: string | null
  detail: string | null
  action: 'tenant' | 'valanserh' | null
  resolvedByStripeSupport: boolean
  sensitiveDecline: boolean
} | null

export function buildLandlordLastPaymentFailure(input: {
  failedAt: DateTime | null
  code: string | null
  declineCode: string | null
  active: boolean
}): LandlordLastPaymentFailure {
  if (!input.failedAt) return null

  const resolution = resolvePaymentFailureMessage({
    code: input.code,
    declineCode: input.declineCode,
  })

  return {
    at: input.failedAt.toUTC().toISO()!,
    active: input.active,
    code: input.code,
    declineCode: input.declineCode,
    key: resolution?.key ?? null,
    title: resolution?.title ?? null,
    detail: resolution?.detail ?? null,
    action: resolution?.action ?? null,
    resolvedByStripeSupport: resolution?.resolvedByStripeSupport ?? false,
    sensitiveDecline: resolution?.sensitiveDecline ?? false,
  }
}

export function isProviderAccountIssue(failure: LandlordLastPaymentFailure): boolean {
  return failure !== null && failure.active && failure.action === 'valanserh'
}
