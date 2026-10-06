import db from '@adonisjs/lucid/services/db'
import type { DatabaseQueryBuilderContract } from '@adonisjs/lucid/types/querybuilder'
import { DateTime } from 'luxon'
import {
  PLATFORM_ACCEPTANCE_DOCUMENT_TYPES,
  TENANT_ACCEPTANCE_ROLE_SLUGS,
  type PlatformAcceptanceDocumentType,
  type PlatformAcceptanceStatusFilter,
} from '#modules/consent/platform/platform_consent.constants'
import type {
  CurrentAcceptanceDocument,
  CurrentAcceptanceDocuments,
  ListTenantAcceptancesInput,
  PlatformConsentRepository,
  PlatformTenantRef,
  TenantAcceptanceRow,
} from '#modules/consent/platform/platform_consent.repository'

/** Fila cruda de `legal_documents` para los documentos vigentes. */
interface CurrentDocumentRow {
  legal_document_id: number
  legal_document_type: PlatformAcceptanceDocumentType
  legal_document_version: string
  legal_document_published_at: Date | string | null
}

/** Fila cruda de la página: empresa + hechos agregados por documento. */
interface TenantAcceptanceRawRow {
  businessUnitId: number
  businessUnitPublicId: string
  businessUnitName: string
  tcLast: Date | string | null
  tcCurrent: Date | string | null
  pnLast: Date | string | null
  pnCurrent: Date | string | null
}

/** Documento del listado con los alias de columna de la agregación que le tocan. */
interface DocumentAggregateColumns {
  hasCurrent: boolean
  lastColumn: string
  currentColumn: string
}

/** Fila cruda de `business_units` para la resolución mínima por id público. */
interface PlatformTenantRawRow {
  businessUnitId: number | string
  businessUnitPublicId: string
  businessUnitName: string
}

/**
 * Implementación MySQL (Knex vía `db`) del puerto de aceptaciones por tenant.
 *
 * DA-1 (quién cuenta como "la empresa aceptó") vive SOLO en `ownerMembershipsQuery`
 * junto con `TENANT_ACCEPTANCE_ROLE_SLUGS`. El predicado de estado replica la tabla de
 * `resolveDocumentStatus`: si uno cambia, cambia el otro (§14).
 */
export default class PlatformConsentRepositoryMysql implements PlatformConsentRepository {
  async findCurrentDocuments(): Promise<CurrentAcceptanceDocuments> {
    const rows = await db
      .from('legal_documents')
      .where('legal_document_is_current', 1)
      .where('legal_document_status', 'published')
      .whereIn('legal_document_type', [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES])
      .select(
        'legal_document_id',
        'legal_document_type',
        'legal_document_version',
        'legal_document_published_at'
      )
      .orderBy('legal_document_id', 'desc')

    const byType = (type: PlatformAcceptanceDocumentType): CurrentAcceptanceDocument | null => {
      const row = (rows as CurrentDocumentRow[]).find((r) => r.legal_document_type === type)
      if (!row) {
        return null
      }
      return {
        legalDocumentId: Number(row.legal_document_id),
        type,
        version: row.legal_document_version,
        publishedAt: this.toDateTime(row.legal_document_published_at),
      }
    }

    return {
      termsConditions: byType('terms_conditions'),
      privacyNotice: byType('privacy_notice'),
    }
  }

  async listTenantAcceptances(
    input: ListTenantAcceptancesInput
  ): Promise<{ rows: TenantAcceptanceRow[]; total: number }> {
    const ownerAgg = db
      .from(this.ownerMembershipsQuery(input.businessUnitIds).as('om'))
      .innerJoin('user_consents as uc', 'uc.user_id', 'om.userId')
      .innerJoin('legal_documents as ld', (j) => {
        j.on('ld.legal_document_id', 'uc.legal_document_id')
        // Biométrico fuera EN LA CONSULTA (regla 9).
        j.andOnIn('ld.legal_document_type', [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES])
      })
      .select(
        'om.businessUnitId',
        db.raw(
          "MAX(CASE WHEN ld.legal_document_type = 'terms_conditions' THEN uc.user_consent_accepted_at END) as tcLast"
        ),
        db.raw(
          "MAX(CASE WHEN ld.legal_document_type = 'privacy_notice' THEN uc.user_consent_accepted_at END) as pnLast"
        ),
        input.current.termsConditions
          ? db.raw(
              'MAX(CASE WHEN ld.legal_document_id = ? THEN uc.user_consent_accepted_at END) as tcCurrent',
              [input.current.termsConditions.legalDocumentId]
            )
          : db.raw('NULL as tcCurrent'),
        input.current.privacyNotice
          ? db.raw(
              'MAX(CASE WHEN ld.legal_document_id = ? THEN uc.user_consent_accepted_at END) as pnCurrent',
              [input.current.privacyNotice.legalDocumentId]
            )
          : db.raw('NULL as pnCurrent')
      )
      .groupBy('om.businessUnitId')

    const aggSql = ownerAgg.toSQL()
    // Los bindings de la agregación son solo ids y slugs (número/texto).
    const aggBindings = [...aggSql.bindings] as Array<string | number>

    const base = db
      .from('business_units as bu')
      // Lucid no tipa subconsultas en `leftJoin`: se une con `joinRaw` usando el SQL de la
      // agregación y sus bindings (los valores siguen enlazados, nada se concatena).
      .joinRaw(
        `left join (${aggSql.sql}) as agg on agg.businessUnitId = bu.business_unit_id`,
        aggBindings
      )
      .whereIn('bu.business_unit_id', input.businessUnitIds)
      .whereNull('bu.business_unit_deleted_at') // fail-closed, duplica el filtro del universo

    if (input.status) {
      base.whereRaw(this.statusPredicate(input.current, input.status))
    }

    const rawRows = (await base
      .clone()
      .select(
        'bu.business_unit_id as businessUnitId',
        'bu.business_unit_public_id as businessUnitPublicId',
        'bu.business_unit_name as businessUnitName',
        'agg.tcLast',
        'agg.tcCurrent',
        'agg.pnLast',
        'agg.pnCurrent'
      )
      .orderBy('bu.business_unit_name', 'asc')
      .limit(input.limit)
      .offset((input.page - 1) * input.limit)) as TenantAcceptanceRawRow[]

    const countRows = (await base.clone().count('* as total')) as Array<{ total: number | string }>
    const total = Number(countRows[0]?.total ?? 0)

    return {
      rows: rawRows.map((row) => ({
        businessUnitId: Number(row.businessUnitId),
        businessUnitPublicId: row.businessUnitPublicId,
        businessUnitName: row.businessUnitName,
        termsConditions: {
          lastAcceptedAt: this.toDateTime(row.tcLast),
          acceptedCurrentAt: this.toDateTime(row.tcCurrent),
        },
        privacyNotice: {
          lastAcceptedAt: this.toDateTime(row.pnLast),
          acceptedCurrentAt: this.toDateTime(row.pnCurrent),
        },
      })),
      total,
    }
  }

  /**
   * Resuelve la empresa activa (no borrada) por su id público (§14). Espejo de la
   * resolución de `PlatformTenantService#getTenantDetail`, acotado a lo que el
   * historial consume; devuelve `null` en vez de lanzar (el 404 vive en el servicio).
   */
  async findBusinessUnitByPublicId(publicId: string): Promise<PlatformTenantRef | null> {
    const row = (await db
      .from('business_units as bu')
      .whereNull('bu.business_unit_deleted_at')
      .where('bu.business_unit_public_id', publicId)
      .select(
        'bu.business_unit_id as businessUnitId',
        'bu.business_unit_public_id as businessUnitPublicId',
        'bu.business_unit_name as businessUnitName'
      )
      .first()) as PlatformTenantRawRow | null

    if (!row) {
      return null
    }

    return {
      businessUnitId: Number(row.businessUnitId),
      businessUnitPublicId: row.businessUnitPublicId,
      businessUnitName: row.businessUnitName,
    }
  }

  /**
   * Ids numéricos distintos de las cuentas aceptantes de la empresa (DA-1). Envuelve
   * `ownerMembershipsQuery`: la regla de quién cuenta NO se reescribe aquí, solo se
   * proyecta la columna `userId` ya calculada por la consulta privada.
   */
  async findOwnerUserIds(businessUnitId: number): Promise<number[]> {
    const rows = (await db
      .from(this.ownerMembershipsQuery([businessUnitId]).as('om'))
      .select('om.userId')) as Array<{ userId: number | string }>

    return rows.map((row) => Number(row.userId))
  }

  /**
   * Pares (empresa, cuenta) cuya aceptación cuenta como "la empresa aceptó" (DA-1).
   * Único punto de la regla, junto con `TENANT_ACCEPTANCE_ROLE_SLUGS`. Expone los alias
   * `businessUnitId` y `userId`, que la agregación usa para unir y agrupar.
   */
  private ownerMembershipsQuery(businessUnitIds: number[]): DatabaseQueryBuilderContract {
    return db
      .from('business_unit_users as buu')
      .innerJoin('users as u', (j) => {
        j.on('u.user_id', 'buu.user_id').andOnNull('u.user_deleted_at')
      })
      .leftJoin('roles as pr', (j) => {
        j.on('pr.role_id', 'buu.role_id').andOnNull('pr.role_deleted_at')
      })
      .leftJoin('roles as br', (j) => {
        j.on('br.role_id', 'u.role_id').andOnNull('br.role_deleted_at')
      })
      .whereIn('buu.business_unit_id', businessUnitIds)
      .whereNull('buu.business_unit_user_deleted_at')
      .where((w) => {
        // Rol escrito en la pivote: manda él (vive en el par empresa-cuenta).
        w.where((pivot) => {
          pivot
            .whereNotNull('buu.role_id')
            .whereIn('pr.role_slug', [...TENANT_ACCEPTANCE_ROLE_SLUGS])
        })
        // Respaldo users.role_id: solo cuenta si el rol es de ESTA empresa o global.
        w.orWhere((fallback) => {
          fallback
            .whereNull('buu.role_id')
            .whereIn('br.role_slug', [...TENANT_ACCEPTANCE_ROLE_SLUGS])
            .where((own) => {
              own.whereNull('br.business_unit_id')
              own.orWhereRaw('br.business_unit_id = buu.business_unit_id')
            })
        })
      })
      .distinct('buu.business_unit_id as businessUnitId', 'buu.user_id as userId')
  }

  /**
   * Predicado SQL del filtro `status` sobre la agregación (`agg`). Misma tabla que
   * `resolveDocumentStatus`; `sin-version-publicada` nunca entra. Los documentos con
   * vigente se derivan de `current`; sin ninguno, cualquier filtro da vacío (regla 12).
   */
  private statusPredicate(
    current: CurrentAcceptanceDocuments,
    status: PlatformAcceptanceStatusFilter
  ): string {
    const documents: DocumentAggregateColumns[] = [
      {
        hasCurrent: current.termsConditions !== null,
        lastColumn: 'agg.tcLast',
        currentColumn: 'agg.tcCurrent',
      },
      {
        hasCurrent: current.privacyNotice !== null,
        lastColumn: 'agg.pnLast',
        currentColumn: 'agg.pnCurrent',
      },
    ].filter((doc) => doc.hasCurrent)

    if (documents.length === 0) {
      return '1 = 0'
    }

    switch (status) {
      case 'al-dia':
        return `(${documents.map((d) => `${d.currentColumn} IS NOT NULL`).join(' AND ')})`
      case 'pendiente':
        return `(${documents
          .map((d) => `(${d.lastColumn} IS NOT NULL AND ${d.currentColumn} IS NULL)`)
          .join(' OR ')})`
      case 'nunca':
        return `(${documents.map((d) => `${d.lastColumn} IS NULL`).join(' OR ')})`
    }
  }

  /** Convierte la fecha que entrega mysql2 (`Date`) a Luxon; `null` si falta o es inválida. */
  private toDateTime(value: Date | string | null | undefined): DateTime | null {
    if (value === null || value === undefined) {
      return null
    }
    const parsed =
      value instanceof Date ? DateTime.fromJSDate(value) : DateTime.fromSQL(String(value))
    return parsed.isValid ? parsed : null
  }
}
