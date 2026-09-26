import type OffboardingConcept from '#models/offboarding_concept'
import type { OffboardingConceptSource } from '../concepts.constants.js'

/**
 * Contrato de salida del catálogo de conceptos (spec §7). No expone
 * `business_unit_id`; los booleanos se normalizan a `boolean` (MySQL
 * devuelve tinyint).
 */
export interface OffboardingConceptDto {
  offboardingConceptId: number
  offboardingConceptName: string
  offboardingConceptDescription: string | null
  offboardingConceptSource: OffboardingConceptSource
  offboardingConceptRequiresEvidence: boolean
  offboardingConceptAllowsAmount: boolean
  offboardingConceptActive: boolean
  offboardingConceptOrder: number
}

export function toOffboardingConceptDto(concept: OffboardingConcept): OffboardingConceptDto {
  return {
    offboardingConceptId: concept.offboardingConceptId,
    offboardingConceptName: concept.offboardingConceptName,
    offboardingConceptDescription: concept.offboardingConceptDescription ?? null,
    offboardingConceptSource: concept.offboardingConceptSource,
    offboardingConceptRequiresEvidence: Boolean(concept.offboardingConceptRequiresEvidence),
    offboardingConceptAllowsAmount: Boolean(concept.offboardingConceptAllowsAmount),
    offboardingConceptActive: Boolean(concept.offboardingConceptActive),
    offboardingConceptOrder: concept.offboardingConceptOrder,
  }
}
