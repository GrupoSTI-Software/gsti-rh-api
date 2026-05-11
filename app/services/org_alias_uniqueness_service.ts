import Department from '#models/department'
import Position from '#models/position'
import OrgAliasAppError from '#exceptions/org_alias_app_error'
import { normalizeForSearch } from '#utils/org_alias_normalize'

type ConflictSource = {
  kind: 'department' | 'position'
  id: number
  label: string
}

/**
 * Valida que ningún token normalizado de alias esté en uso en otro departamento o puesto
 * de la misma unidad de negocio (business_unit_id).
 */
export default class OrgAliasUniquenessService {
  /**
   * Tokens normalizados únicos a partir del valor almacenado (lista separada por comas).
   */
  static tokensFromStoredAliases(stored: string): string[] {
    const out: string[] = []
    const seen = new Set<string>()
    for (const part of stored.split(',')) {
      const trimmed = part.trim()
      if (trimmed === '') continue
      const n = normalizeForSearch(trimmed)
      if (n === '' || seen.has(n)) continue
      seen.add(n)
      out.push(n)
    }
    return out
  }

  async assertUniqueForBusinessUnit(params: {
    businessUnitId: number
    normalizedTokens: string[]
    excludeDepartmentId?: number
    excludePositionId?: number
  }): Promise<void> {
    const { businessUnitId, normalizedTokens, excludeDepartmentId, excludePositionId } = params

    if (normalizedTokens.length === 0) return

    const deptRows = await Department.query()
      .where('business_unit_id', businessUnitId)
      .whereNull('department_deleted_at')
      .whereNotNull('aliases')

    const posRows = await Position.query()
      .where('business_unit_id', businessUnitId)
      .whereNull('position_deleted_at')
      .whereNotNull('aliases')

    const map = new Map<string, ConflictSource>()

    for (const row of deptRows) {
      if (excludeDepartmentId && row.departmentId === excludeDepartmentId) continue
      if (!row.aliases) continue
      for (const token of OrgAliasUniquenessService.tokensFromStoredAliases(row.aliases)) {
        if (!map.has(token)) {
          map.set(token, {
            kind: 'department',
            id: row.departmentId,
            label: row.departmentName,
          })
        }
      }
    }

    for (const row of posRows) {
      if (excludePositionId && row.positionId === excludePositionId) continue
      if (!row.aliases) continue
      for (const token of OrgAliasUniquenessService.tokensFromStoredAliases(row.aliases)) {
        if (!map.has(token)) {
          map.set(token, {
            kind: 'position',
            id: row.positionId,
            label: row.positionName,
          })
        }
      }
    }

    for (const token of normalizedTokens) {
      const conflict = map.get(token)
      if (!conflict) continue
      const who =
        conflict.kind === 'department'
          ? `el departamento «${conflict.label}»`
          : `el puesto «${conflict.label}»`
      throw new OrgAliasAppError(
        'alias-en-uso',
        'Alias en uso',
        `El alias ya está en uso por ${who} de la misma unidad de negocio.`
      )
    }
  }
}
