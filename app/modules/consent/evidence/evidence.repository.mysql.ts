import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import db from '@adonisjs/lucid/services/db'
import UserConsent from '#models/user_consent'
import type { LegalDocumentType } from '#models/legal_document'
import type {
  EvidenceFilters,
  EvidencePageResult,
  EvidencePagination,
  EvidenceRepository,
} from './evidence.repository.js'

/** Slugs que marcan una cuenta como de plataforma en la empresa del filtro (§4 regla 1). */
const PLATFORM_ACCOUNT_ROLE_SLUGS = ['root'] as const

/**
 * Implementación Lucid del repositorio de evidencia de aceptaciones.
 *
 * El filtro por empresa (`businessUnitId`) usa `whereHas` sobre el pivot
 * `business_unit_users` (vía `user.businessUnits`), NUNCA un `join` de selección:
 * un usuario puede pertenecer a varias unidades de negocio, y un join de
 * selección duplicaría cada fila de evidencia una vez por unidad de negocio.
 *
 * Extensión USRH1784146205513 (H6, obligatoria): un asiento físico puede no tener
 * usuario, así que el preload/filtro de empresa considera TAMBIÉN `employee.businessUnit`
 * (ancla alternativa — mismo criterio de alcance que el ancla por user, S8.2). El
 * preload de `employee` usa `withTrashed()`: la baja del empleado no debe hacer
 * desaparecer su asiento de la evidencia (regla 11).
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
      .preload('employee', (employeeQuery) => {
        employeeQuery.withTrashed().preload('person').preload('businessUnit')
      })
      .preload('registeredBy', (registeredByQuery) => {
        registeredByQuery.preload('person')
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
      .if(filters.channel, (query) => {
        query.where('user_consent_channel', filters.channel as string)
      })
      .if(filters.businessUnitId, (query) => {
        const businessUnitId = filters.businessUnitId as number
        query.where((outer) => {
          outer
            .whereHas('user', (userQuery) => {
              userQuery.whereHas('businessUnits', (businessUnitQuery) => {
                // Columna calificada: el `whereHas` de una relación many-to-many hace JOIN
                // contra el pivot `business_unit_users` (que también tiene `business_unit_id`),
                // por lo que la columna sin calificar es ambigua para MySQL.
                businessUnitQuery.where('business_units.business_unit_id', businessUnitId)
              })
            })
            .orWhereHas('employee', (employeeQuery) => {
              employeeQuery.withTrashed().where('business_unit_id', businessUnitId)
            })
        })
      })
      .if(filters.types !== undefined, (query) => {
        const types = filters.types as LegalDocumentType[]
        if (types.length === 0) {
          // Fail-closed: un arreglo vacío no significa "sin filtro".
          query.whereRaw('1 = 0')
          return
        }
        query.whereHas('legalDocument', (documentQuery) => {
          documentQuery.whereIn('legal_document_type', types)
        })
      })
      .if(filters.excludePlatformAccounts, (query) => {
        const businessUnitId = filters.businessUnitId
        if (!businessUnitId) {
          // Fail-closed: sin empresa del filtro la exclusión no devuelve nada (CA-8b).
          query.whereRaw('1 = 0')
          return
        }
        query.where((outer) => {
          outer
            // Asientos sin usuario quedan (el filtro types ya saca el biométrico).
            .whereNull('user_consents.user_id')
            .orWhereNotExists((sub) => {
              sub
                .from('users as pa_u')
                .leftJoin('business_unit_users as pa_buu', (j) => {
                  j.on('pa_buu.user_id', 'pa_u.user_id')
                    .andOnVal('pa_buu.business_unit_id', businessUnitId)
                    .andOnNull('pa_buu.business_unit_user_deleted_at')
                })
                .leftJoin(
                  'roles as pa_r',
                  'pa_r.role_id',
                  db.raw('COALESCE(pa_buu.role_id, pa_u.role_id)')
                )
                .whereColumn('pa_u.user_id', 'user_consents.user_id')
                .where((w) => {
                  w.where('pa_u.is_platform_admin', true).orWhereIn('pa_r.role_slug', [
                    ...PLATFORM_ACCOUNT_ROLE_SLUGS,
                  ])
                })
            })
        })
      })
      .orderBy('user_consent_accepted_at', 'desc')
  }
}
