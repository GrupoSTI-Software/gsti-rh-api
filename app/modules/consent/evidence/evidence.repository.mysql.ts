import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import UserConsent from '#models/user_consent'
import type {
  EvidenceFilters,
  EvidencePageResult,
  EvidencePagination,
  EvidenceRepository,
} from './evidence.repository.js'

/**
 * Implementación Lucid del repositorio de evidencia de aceptaciones.
 *
 * El filtro por empresa (`businessUnitId`) usa `whereHas` sobre el pivot
 * `business_unit_users` (vía `user.businessUnits`), NUNCA un `join` de selección:
 * un usuario puede pertenecer a varias unidades de negocio, y un join de
 * selección duplicaría cada fila de evidencia una vez por unidad de negocio.
 */
export default class EvidenceRepositoryMysql implements EvidenceRepository {
  async findEvidence(
    filters: EvidenceFilters,
    pagination: EvidencePagination
  ): Promise<EvidencePageResult> {
    const paginator = await this.baseQuery(filters).paginate(pagination.page, pagination.perPage)

    return {
      rows: paginator.all(),
      meta: {
        total: paginator.total,
        perPage: paginator.perPage,
        currentPage: paginator.currentPage,
        lastPage: paginator.lastPage,
      },
    }
  }

  async findAllForExport(filters: EvidenceFilters): Promise<UserConsent[]> {
    return this.baseQuery(filters)
  }

  private baseQuery(filters: EvidenceFilters): ModelQueryBuilderContract<typeof UserConsent> {
    return UserConsent.query()
      .preload('user', (userQuery) => {
        userQuery.preload('person')
        userQuery.preload('businessUnits')
      })
      .preload('legalDocument')
      .if(filters.legalDocumentId, (query) => {
        query.where('legal_document_id', filters.legalDocumentId as number)
      })
      .if(!filters.legalDocumentId && (filters.type || filters.version), (query) => {
        query.whereHas('legalDocument', (documentQuery) => {
          if (filters.type) {
            documentQuery.where('legal_document_type', filters.type as string)
          }
          if (filters.version) {
            documentQuery.where('legal_document_version', filters.version as string)
          }
        })
      })
      .if(filters.userId, (query) => {
        query.where('user_id', filters.userId as number)
      })
      .if(filters.businessUnitId, (query) => {
        query.whereHas('user', (userQuery) => {
          userQuery.whereHas('businessUnits', (businessUnitQuery) => {
            // Columna calificada: el `whereHas` de una relación many-to-many hace JOIN
            // contra el pivot `business_unit_users` (que también tiene `business_unit_id`),
            // por lo que la columna sin calificar es ambigua para MySQL.
            businessUnitQuery.where('business_units.business_unit_id', filters.businessUnitId as number)
          })
        })
      })
      .orderBy('user_consent_accepted_at', 'desc')
  }
}
