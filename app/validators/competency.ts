import vine from '@vinejs/vine'

const competencyTypeEnum = vine.enum(['technical', 'functional'] as const)

/**
 * VLRH-H1792175042593 — valida el query-param `competencyType` de
 * `GET /api/competencies`. Solo acepta `technical` o `functional`; un valor
 * fuera del enum responde 422. Ausente o vacío equivale a "sin filtro" (el
 * caller convierte el string vacío en `undefined` antes de llamar).
 */
export const competencyListValidator = vine.compile(
  vine.object({
    competencyType: competencyTypeEnum.clone().optional(),
  })
)

export const createCompetencyValidator = vine.compile(
  vine.object({
    competencyName: vine.string().trim().minLength(1).maxLength(255),
    competencyType: competencyTypeEnum,
  })
)

export const updateCompetencyValidator = vine.compile(
  vine.object({
    competencyName: vine.string().trim().minLength(1).maxLength(255),
    competencyType: competencyTypeEnum,
  })
)
