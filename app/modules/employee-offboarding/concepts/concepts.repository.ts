import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type BusinessUnit from '#models/business_unit'
import type OffboardingConcept from '#models/offboarding_concept'
import type { OffboardingConceptSource } from './concepts.constants.js'

/** Datos para insertar un concepto (siembra o alta manual). */
export interface OffboardingConceptCreateData {
  businessUnitId: number
  offboardingConceptName: string
  offboardingConceptDescription: string | null
  offboardingConceptSource: OffboardingConceptSource
  offboardingConceptRequiresEvidence: boolean
  offboardingConceptAllowsAmount: boolean
  offboardingConceptOrder: number
}

/** Valores finales a aplicar en una edición (el servicio ya resolvió defaults). */
export interface OffboardingConceptUpdateData {
  offboardingConceptName: string
  offboardingConceptDescription: string | null
  offboardingConceptRequiresEvidence: boolean
  offboardingConceptAllowsAmount: boolean
}

/**
 * Puerto de acceso a datos del catálogo de conceptos de salida
 * (USRH1786568279581). El adaptador MySQL es el ÚNICO que toca Lucid; la
 * transacción se propaga como parámetro `trx` (molde
 * `app/modules/legal-documents/legal_document.service.ts`).
 */
export interface ConceptsRepository {
  /** Conceptos vivos de la empresa, ordenados por `order` asc y luego id asc (regla 7). */
  listLiveOrdered(
    businessUnitId: number,
    trx?: TransactionClientContract
  ): Promise<OffboardingConcept[]>

  /**
   * Total de conceptos de la empresa INCLUYENDO eliminados lógicamente:
   * la guarda de la siembra (regla 3) respeta el catálogo vaciado a propósito.
   */
  countIncludingDeleted(businessUnitId: number, trx: TransactionClientContract): Promise<number>

  /**
   * Bloquea la fila de `business_units` de la empresa (`forUpdate`) para
   * serializar la siembra perezosa (regla 2). La fila siempre existe, así
   * que el bloqueo es determinista — nunca un gap lock sobre rango vacío.
   */
  lockBusinessUnit(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<BusinessUnit | null>

  /** Empresa viva (no eliminada) para la verificación de referencia (422). */
  findLiveBusinessUnit(businessUnitId: number): Promise<BusinessUnit | null>

  /** Bloquea los conceptos vivos de la empresa antes de verificar unicidad u orden. */
  lockLiveByBusinessUnit(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<OffboardingConcept[]>

  /** Concepto vivo dentro del alcance; null = inexistente o fuera del alcance (404 uniforme). */
  findLiveByIdInScope(
    offboardingConceptId: number,
    businessUnitIds: number[]
  ): Promise<OffboardingConcept | null>

  /** Igual que `findLiveByIdInScope`, con bloqueo `forUpdate` dentro de la transacción. */
  lockLiveByIdInScope(
    offboardingConceptId: number,
    businessUnitIds: number[],
    trx: TransactionClientContract
  ): Promise<OffboardingConcept | null>

  /** Inserta el conjunto base de la siembra perezosa dentro de la transacción. */
  createMany(rows: OffboardingConceptCreateData[], trx: TransactionClientContract): Promise<void>

  create(
    data: OffboardingConceptCreateData,
    trx: TransactionClientContract
  ): Promise<OffboardingConcept>

  update(
    concept: OffboardingConcept,
    data: OffboardingConceptUpdateData,
    trx: TransactionClientContract
  ): Promise<OffboardingConcept>

  /** Persiste el nuevo lugar de un concepto durante el reordenamiento 1..n. */
  updateOrder(
    concept: OffboardingConcept,
    offboardingConceptOrder: number,
    trx: TransactionClientContract
  ): Promise<void>

  softDelete(concept: OffboardingConcept, trx: TransactionClientContract): Promise<void>
}
