import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import BusinessUnit from '#models/business_unit'
import OffboardingConcept from '#models/offboarding_concept'
import type {
  ConceptsRepository,
  OffboardingConceptCreateData,
  OffboardingConceptUpdateData,
} from './concepts.repository.js'

/**
 * Adaptador MySQL del catálogo de conceptos de salida (USRH1786568279581).
 * Único punto del slice que toca Lucid. Todos los filtros de empresa van
 * EXPLÍCITOS (`where business_unit_id` / `whereIn`) además del mixin de
 * scope: defensa en profundidad para invocaciones fuera de una request con
 * `businessScope()` (nota de diseño 6 del spec).
 */
export default class ConceptsRepositoryMysql implements ConceptsRepository {
  async listLiveOrdered(
    businessUnitId: number,
    trx?: TransactionClientContract
  ): Promise<OffboardingConcept[]> {
    return await OffboardingConcept.query({ client: trx })
      .where('business_unit_id', businessUnitId)
      .whereNull('offboarding_concept_deleted_at')
      .orderBy('offboarding_concept_order', 'asc')
      .orderBy('offboarding_concept_id', 'asc')
  }

  async countIncludingDeleted(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<number> {
    // Sin filtrar `deleted_at`: la guarda de la siembra respeta el catálogo
    // vaciado a propósito (regla 3). `withTrashed` desactiva el filtro del
    // mixin de borrado lógico.
    const rows = await OffboardingConcept.query({ client: trx })
      .withTrashed()
      .where('business_unit_id', businessUnitId)
      .count('* as total')

    return Number(rows[0].$extras.total ?? 0)
  }

  async lockBusinessUnit(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<BusinessUnit | null> {
    return await BusinessUnit.query({ client: trx })
      .where('business_unit_id', businessUnitId)
      .forUpdate()
      .first()
  }

  async findLiveBusinessUnit(businessUnitId: number): Promise<BusinessUnit | null> {
    return await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_id', businessUnitId)
      .first()
  }

  async lockLiveByBusinessUnit(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<OffboardingConcept[]> {
    return await OffboardingConcept.query({ client: trx })
      .where('business_unit_id', businessUnitId)
      .whereNull('offboarding_concept_deleted_at')
      .forUpdate()
  }

  async findLiveByIdInScope(
    offboardingConceptId: number,
    businessUnitIds: number[]
  ): Promise<OffboardingConcept | null> {
    if (businessUnitIds.length === 0) return null
    return await OffboardingConcept.query()
      .where('offboarding_concept_id', offboardingConceptId)
      .whereIn('business_unit_id', businessUnitIds)
      .whereNull('offboarding_concept_deleted_at')
      .first()
  }

  async lockLiveByIdInScope(
    offboardingConceptId: number,
    businessUnitIds: number[],
    trx: TransactionClientContract
  ): Promise<OffboardingConcept | null> {
    if (businessUnitIds.length === 0) return null
    return await OffboardingConcept.query({ client: trx })
      .where('offboarding_concept_id', offboardingConceptId)
      .whereIn('business_unit_id', businessUnitIds)
      .whereNull('offboarding_concept_deleted_at')
      .forUpdate()
      .first()
  }

  async createMany(
    rows: OffboardingConceptCreateData[],
    trx: TransactionClientContract
  ): Promise<void> {
    await OffboardingConcept.createMany(
      rows.map((row) => ({ ...row })),
      { client: trx }
    )
  }

  async create(
    data: OffboardingConceptCreateData,
    trx: TransactionClientContract
  ): Promise<OffboardingConcept> {
    const concept = new OffboardingConcept()
    concept.useTransaction(trx)
    concept.businessUnitId = data.businessUnitId
    concept.offboardingConceptName = data.offboardingConceptName
    concept.offboardingConceptDescription = data.offboardingConceptDescription
    concept.offboardingConceptSource = data.offboardingConceptSource
    concept.offboardingConceptRequiresEvidence = data.offboardingConceptRequiresEvidence
    concept.offboardingConceptAllowsAmount = data.offboardingConceptAllowsAmount
    concept.offboardingConceptActive = true
    concept.offboardingConceptOrder = data.offboardingConceptOrder
    await concept.save()
    return concept
  }

  async update(
    concept: OffboardingConcept,
    data: OffboardingConceptUpdateData,
    trx: TransactionClientContract
  ): Promise<OffboardingConcept> {
    concept.useTransaction(trx)
    concept.offboardingConceptName = data.offboardingConceptName
    concept.offboardingConceptDescription = data.offboardingConceptDescription
    concept.offboardingConceptRequiresEvidence = data.offboardingConceptRequiresEvidence
    concept.offboardingConceptAllowsAmount = data.offboardingConceptAllowsAmount
    await concept.save()
    return concept
  }

  async updateOrder(
    concept: OffboardingConcept,
    offboardingConceptOrder: number,
    trx: TransactionClientContract
  ): Promise<void> {
    concept.useTransaction(trx)
    concept.offboardingConceptOrder = offboardingConceptOrder
    await concept.save()
  }

  async softDelete(concept: OffboardingConcept, trx: TransactionClientContract): Promise<void> {
    concept.useTransaction(trx)
    await concept.delete()
  }
}
