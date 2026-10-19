import type { Infer } from '@vinejs/vine/types'
import type { PositionTemplateErrorCode } from '#constants/position_template_error_codes'
import type { positionTemplateFileValidator } from '#modules/position-templates/validators/position_template_file.validator'

/** Documento ya validado por el esquema vine (formato v1). */
export type PositionTemplateFile = Infer<typeof positionTemplateFileValidator>
export type PositionTemplateJobProfile = NonNullable<PositionTemplateFile['puestos']>[number]

/**
 * Documento leído de disco, todavía sin validar. `path` es relativo a la raíz de la
 * app. `requested: false` = entra al conjunto solo como contexto (unicidad entre
 * archivos) y sus hallazgos no se reportan.
 */
export interface PositionTemplateSourceDocument {
  path: string
  content: unknown
  requested: boolean
}

export interface PositionTemplateLoadResult {
  documents: PositionTemplateSourceDocument[]
  findings: PositionTemplateFinding[]
}

/** `subject` = `<ruta relativa>#<ruta del dato>`; `detail` nunca repite el valor rechazado. */
export interface PositionTemplateFinding {
  code: PositionTemplateErrorCode
  key: string
  title: string
  subject: string
  detail: string
}

export interface PositionTemplateEntry<T> {
  file: string
  index: number
  item: T
}

export interface PositionTemplateCatalog {
  jobProfiles: PositionTemplateEntry<PositionTemplateJobProfile>[]
}

/** Con hallazgos no hay `catalog`: el tipo impide cargar contenido rechazado. */
export type PositionTemplateValidationResult =
  | { ok: true; findings: []; catalog: PositionTemplateCatalog }
  | {
      ok: false
      findings: [PositionTemplateFinding, ...PositionTemplateFinding[]]
      catalog?: never
    }
