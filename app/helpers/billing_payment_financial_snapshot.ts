import BillingSubscription from '#models/billing_subscription'
import BillingSubscriptionChange from '#models/billing_subscription_change'
import {
  discountSnapshotInconsistentError,
  changeInconsistentSnapshotError,
} from '#helpers/billing_payment_error'

export type DiscountCodeKind = 'percent' | 'fixed_amount' | 'unit_price'

export interface FinancialTerms {
  ref: string
  employees: number
  unitAmount: number
  discountPercent: number
  taxRate: number
  contractedSubtotal: number
  contractedTaxAmount: number
  contractedTotal: number
  codeDiscountAmount: number
  discountCodeText: string | null
  discountCodeKind: DiscountCodeKind | null
  benefitPeriods: number | null
  benefitPeriodsUsed: number
  listUnitAmount: number | null
  undiscountedSubtotal: number | null
  undiscountedTaxAmount: number | null
  undiscountedTotal: number | null
}

export interface FrozenDiscount {
  text: string
  kind: DiscountCodeKind
  valueCents: number
  benefitPeriods: number | null
  benefitPeriodsUsed: number
  codeDiscountAmountCents: number
  undiscountedSubtotal: number
}

export interface FinancialSnapshot {
  grossCents: number
  discountAmountCents: number
  subtotalCents: number
  taxAmountCents: number
  totalCents: number
  codeDiscountAmountCents: number
  discountCodeText: string | null
  discountCodeBenefitPeriodsUsedAfter: number | null
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Un pago sin desglose (marcador `totalCents = 0`, migración 1785766125021)
 * no puede facturarse. Regla única del producto: el detalle del pago y el
 * alta del comprobante fiscal la consumen tal cual.
 */
export function hasFinancialSnapshot(totalCents: number): boolean {
  return Number(totalCents) !== 0
}

export function financialTermsFromSubscription(sub: BillingSubscription): FinancialTerms {
  return {
    ref: `Suscripción ${sub.billingSubscriptionId}`,
    employees: sub.billingSubscriptionContractedEmployees,
    unitAmount: Number(sub.billingSubscriptionContractedUnitAmount),
    discountPercent: Number(sub.billingSubscriptionDiscountPercent),
    taxRate: Number(sub.billingSubscriptionContractedTaxRate),
    contractedSubtotal: Number(sub.billingSubscriptionContractedSubtotal),
    contractedTaxAmount: Number(sub.billingSubscriptionContractedTaxAmount),
    contractedTotal: Number(sub.billingSubscriptionContractedTotal),
    codeDiscountAmount: Number(sub.billingSubscriptionCodeDiscountAmount ?? 0),
    discountCodeText: sub.billingSubscriptionDiscountCodeText,
    discountCodeKind: sub.billingSubscriptionDiscountCodeKind as DiscountCodeKind | null,
    benefitPeriods: sub.billingSubscriptionDiscountCodeBenefitPeriods,
    benefitPeriodsUsed: sub.billingSubscriptionDiscountCodeBenefitPeriodsUsed,
    listUnitAmount:
      sub.billingSubscriptionUndiscountedUnitAmount === null
        ? null
        : Number(sub.billingSubscriptionUndiscountedUnitAmount),
    undiscountedSubtotal:
      sub.billingSubscriptionUndiscountedSubtotal === null
        ? null
        : Number(sub.billingSubscriptionUndiscountedSubtotal),
    undiscountedTaxAmount:
      sub.billingSubscriptionUndiscountedTaxAmount === null
        ? null
        : Number(sub.billingSubscriptionUndiscountedTaxAmount),
    undiscountedTotal:
      sub.billingSubscriptionUndiscountedTotal === null
        ? null
        : Number(sub.billingSubscriptionUndiscountedTotal),
  }
}

export function financialTermsFromIncreaseChange(
  change: BillingSubscriptionChange,
  sub: BillingSubscription
): FinancialTerms {
  if (
    change.billingSubscriptionChangeType !== 'increase' ||
    change.billingSubscriptionId !== sub.billingSubscriptionId
  ) {
    throw changeInconsistentSnapshotError(
      `Cambio ${change.billingSubscriptionChangeId}: tipo no es increase o pertenece a otra suscripción`
    )
  }

  return {
    ref: `Cambio ${change.billingSubscriptionChangeId}`,
    employees: change.billingSubscriptionChangeNewEmployees,
    unitAmount: Number(change.billingSubscriptionChangeUnitAmount),
    discountPercent: Number(change.billingSubscriptionChangeDiscountPercent),
    taxRate: Number(change.billingSubscriptionChangeTaxRate),
    contractedSubtotal: Number(change.billingSubscriptionChangeSubtotal),
    contractedTaxAmount: Number(change.billingSubscriptionChangeTaxAmount),
    contractedTotal: Number(change.billingSubscriptionChangeTotal),
    codeDiscountAmount: Number(change.billingSubscriptionChangeCodeDiscountAmount ?? 0),
    discountCodeText: change.billingSubscriptionChangeDiscountCodeText,
    discountCodeKind: change.billingSubscriptionChangeDiscountCodeKind as DiscountCodeKind | null,
    benefitPeriods: sub.billingSubscriptionDiscountCodeBenefitPeriods,
    benefitPeriodsUsed: sub.billingSubscriptionDiscountCodeBenefitPeriodsUsed,
    listUnitAmount:
      change.billingSubscriptionChangeUndiscountedUnitAmount === null
        ? null
        : Number(change.billingSubscriptionChangeUndiscountedUnitAmount),
    undiscountedSubtotal:
      change.billingSubscriptionChangeUndiscountedSubtotal === null
        ? null
        : Number(change.billingSubscriptionChangeUndiscountedSubtotal),
    undiscountedTaxAmount:
      change.billingSubscriptionChangeUndiscountedTaxAmount === null
        ? null
        : Number(change.billingSubscriptionChangeUndiscountedTaxAmount),
    undiscountedTotal:
      change.billingSubscriptionChangeUndiscountedTotal === null
        ? null
        : Number(change.billingSubscriptionChangeUndiscountedTotal),
  }
}

export function readFrozenDiscount(terms: FinancialTerms): FrozenDiscount | null {
  if (!terms.discountCodeText) {
    return null
  }

  if (
    terms.benefitPeriods !== null &&
    terms.benefitPeriodsUsed >= terms.benefitPeriods
  ) {
    return null
  }

  if (
    !terms.discountCodeKind ||
    terms.undiscountedSubtotal === null ||
    terms.undiscountedTaxAmount === null ||
    terms.undiscountedTotal === null
  ) {
    throw discountSnapshotInconsistentError(
      `${terms.ref}: acuerdo de descuento congelado incompleto o kind inválido`
    )
  }

  const expectedSubtotal = round2(terms.undiscountedSubtotal - terms.codeDiscountAmount)
  if (Math.abs(expectedSubtotal - terms.contractedSubtotal) > 0.01) {
    throw discountSnapshotInconsistentError(
      `${terms.ref}: undiscounted_subtotal − code_discount_amount no cuadra con contracted_subtotal`
    )
  }

  return {
    text: terms.discountCodeText,
    kind: terms.discountCodeKind,
    valueCents: Math.round(terms.codeDiscountAmount * 100),
    benefitPeriods: terms.benefitPeriods,
    benefitPeriodsUsed: terms.benefitPeriodsUsed,
    codeDiscountAmountCents: Math.round(terms.codeDiscountAmount * 100),
    undiscountedSubtotal: terms.undiscountedSubtotal,
  }
}

export function computeFinancialSnapshot(
  terms: FinancialTerms,
  frozen: FrozenDiscount | null
): FinancialSnapshot {
  if (!frozen) {
    const listUnit = terms.listUnitAmount ?? terms.unitAmount
    const grossPrice = round2(listUnit * terms.employees)
    const volumeDiscount = round2(grossPrice * (terms.discountPercent / 100))
    const subtotal = round2(grossPrice - volumeDiscount)
    const tax = round2(subtotal * terms.taxRate)
    const total = round2(subtotal + tax)

    return {
      grossCents: Math.round(grossPrice * 100),
      discountAmountCents: Math.round(volumeDiscount * 100),
      subtotalCents: Math.round(subtotal * 100),
      taxAmountCents: Math.round(tax * 100),
      totalCents: Math.round(total * 100),
      codeDiscountAmountCents: 0,
      discountCodeText: null,
      discountCodeBenefitPeriodsUsedAfter: null,
    }
  }

  const grossPrice = round2((terms.listUnitAmount ?? terms.unitAmount) * terms.employees)
  const codeDiscount = frozen.codeDiscountAmountCents / 100
  const subtotal = terms.contractedSubtotal
  const volumeDiscount = round2(grossPrice - subtotal - codeDiscount)
  const tax = terms.contractedTaxAmount
  const total = terms.contractedTotal

  return {
    grossCents: Math.round(grossPrice * 100),
    discountAmountCents: Math.round(volumeDiscount * 100),
    subtotalCents: Math.round(subtotal * 100),
    taxAmountCents: Math.round(tax * 100),
    totalCents: Math.round(total * 100),
    codeDiscountAmountCents: frozen.codeDiscountAmountCents,
    discountCodeText: frozen.text,
    discountCodeBenefitPeriodsUsedAfter: frozen.benefitPeriodsUsed,
  }
}