import { escapeLikePattern, normalizeForSearch } from '#utils/org_alias_normalize'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type {
  RelationQueryBuilderContract,
  RelationSubQueryBuilderContract,
} from '@adonisjs/lucid/types/relations'
import Department from '#models/department'
import Position from '#models/position'

export type PositionSearchableQuery =
  | ModelQueryBuilderContract<typeof Position, Position>
  | RelationQueryBuilderContract<typeof Position, Position>
  | RelationSubQueryBuilderContract<typeof Position>

export type DepartmentSearchableQuery =
  | ModelQueryBuilderContract<typeof Department, Department>
  | RelationSubQueryBuilderContract<typeof Department>

const ACCENT_REPLACE_PAIRS: Array<[string, string]> = [
  ['á', 'a'],
  ['à', 'a'],
  ['ä', 'a'],
  ['â', 'a'],
  ['ã', 'a'],
  ['å', 'a'],
  ['é', 'e'],
  ['è', 'e'],
  ['ë', 'e'],
  ['ê', 'e'],
  ['í', 'i'],
  ['ì', 'i'],
  ['ï', 'i'],
  ['î', 'i'],
  ['ó', 'o'],
  ['ò', 'o'],
  ['ö', 'o'],
  ['ô', 'o'],
  ['õ', 'o'],
  ['ø', 'o'],
  ['ú', 'u'],
  ['ù', 'u'],
  ['ü', 'u'],
  ['û', 'u'],
  ['ñ', 'n'],
  ['ç', 'c'],
  ['Á', 'a'],
  ['À', 'a'],
  ['Ä', 'a'],
  ['Â', 'a'],
  ['Ã', 'a'],
  ['Å', 'a'],
  ['É', 'e'],
  ['È', 'e'],
  ['Ë', 'e'],
  ['Ê', 'e'],
  ['Í', 'i'],
  ['Ì', 'i'],
  ['Ï', 'i'],
  ['Î', 'i'],
  ['Ó', 'o'],
  ['Ò', 'o'],
  ['Ö', 'o'],
  ['Ô', 'o'],
  ['Õ', 'o'],
  ['Ø', 'o'],
  ['Ú', 'u'],
  ['Ù', 'u'],
  ['Ü', 'u'],
  ['Û', 'u'],
  ['Ñ', 'n'],
  ['Ç', 'c'],
]

/**
 * Expresión MySQL: columna o expresión a minúsculas sin acentos comunes en español.
 * `columnExpr` debe ser un identificador seguro (no entrada de usuario).
 */
export function mysqlAccentFoldLower(columnExpr: string): string {
  let expr = columnExpr
  for (const [from, to] of ACCENT_REPLACE_PAIRS) {
    const f = from.replace(/'/g, "''")
    const t = to.replace(/'/g, "''")
    expr = `REPLACE(${expr}, '${f}', '${t}')`
  }
  return `LOWER(${expr})`
}

function buildSearchPattern(rawSearch: string): string {
  const normalized = normalizeForSearch(rawSearch.trim())
  return `%${escapeLikePattern(normalized)}%`
}

/**
 * Filtro por nombre o alias (incluye department_alias legado) para listados de departamentos.
 */
export function applyDepartmentNameOrAliasesSearch(
  query: DepartmentSearchableQuery,
  rawSearch: string | undefined
) {
  if (!rawSearch?.trim()) return

  const pattern = buildSearchPattern(rawSearch)
  const nameExpr = mysqlAccentFoldLower('department_name')
  const aliasesExpr = mysqlAccentFoldLower('COALESCE(department_aliases, "")')
  const legacyExpr = mysqlAccentFoldLower('COALESCE(department_alias, "")')

  query.where((sub) => {
    sub.whereRaw(`${nameExpr} LIKE ? ESCAPE ?`, [pattern, '\\'])
    sub.orWhereRaw(`${aliasesExpr} LIKE ? ESCAPE ?`, [pattern, '\\'])
    sub.orWhereRaw(`${legacyExpr} LIKE ? ESCAPE ?`, [pattern, '\\'])
  })
}

/**
 * Filtro por nombre o alias (incluye position_alias legado) sobre consultas de Position.
 */
export function applyPositionNameOrAliasesSearch(
  query: PositionSearchableQuery,
  rawSearch: string | undefined
) {
  if (!rawSearch?.trim()) return

  const pattern = buildSearchPattern(rawSearch)
  const nameExpr = mysqlAccentFoldLower('position_name')
  const aliasesExpr = mysqlAccentFoldLower('COALESCE(position_aliases, "")')
  const legacyExpr = mysqlAccentFoldLower('COALESCE(position_alias, "")')

  query.where((sub) => {
    sub.whereRaw(`${nameExpr} LIKE ? ESCAPE ?`, [pattern, '\\'])
    sub.orWhereRaw(`${aliasesExpr} LIKE ? ESCAPE ?`, [pattern, '\\'])
    sub.orWhereRaw(`${legacyExpr} LIKE ? ESCAPE ?`, [pattern, '\\'])
  })
}
