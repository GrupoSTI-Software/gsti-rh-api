import vine from '@vinejs/vine'
import { COMPETENCY_STANDARD_LEVEL_POSITIONS } from '#constants/competency_standard_levels'
import {
  POSITION_TEMPLATE_CERTIFICATION_CATEGORY_KEYS,
  POSITION_TEMPLATE_CODE_PATTERN,
  POSITION_TEMPLATE_COMPETENCY_TYPES,
  POSITION_TEMPLATE_EMPLOYEE_RANGES,
  POSITION_TEMPLATE_SCIAN_PATTERN,
  POSITION_TEMPLATE_SCOPES,
  POSITION_TEMPLATE_SINCO_PATTERN,
  POSITION_TEMPLATE_SOURCE_KEYS,
  POSITION_TEMPLATE_STATUSES,
  POSITION_TEMPLATE_TELEWORK_CATEGORIES,
} from '#constants/position_template_format'

/**
 * Esquema del archivo de plantillas, formato v1 (VLRH-H1792026425571).
 * Valida un documento aislado. Lo condicional (atribución según fuente, alcance
 * contra giros) y lo que cruza documentos lo valida PositionTemplateValidationService.
 */
export const positionTemplateCode = () =>
  vine.string().trim().minLength(2).maxLength(60).regex(POSITION_TEMPLATE_CODE_PATTERN)
export const positionTemplateVersion = () => vine.number({ strict: true }).withoutDecimals().min(1)
export const positionTemplateStatus = () => vine.enum(POSITION_TEMPLATE_STATUSES)

export const positionTemplateAttribution = () =>
  vine.object({
    fuente: vine.enum(POSITION_TEMPLATE_SOURCE_KEYS),
    id_en_fuente: vine.string().trim().minLength(1).maxLength(100).optional(),
    adaptado: vine.boolean({ strict: true }),
  })

const textSection = () =>
  vine.object({
    texto: vine.string().trim().minLength(1).maxLength(5000),
    atribucion: positionTemplateAttribution(),
  })

export const positionTemplateJobProfileSchema = vine.object({
  codigo: positionTemplateCode(),
  version: positionTemplateVersion(),
  estado: positionTemplateStatus(),
  nombre: vine.string().trim().minLength(1).maxLength(100),
  codigo_sinco: vine.string().trim().regex(POSITION_TEMPLATE_SINCO_PATTERN),
  alcance: vine.enum(POSITION_TEMPLATE_SCOPES),
  giros: vine.array(positionTemplateCode()).minLength(1).maxLength(20).optional(),
  descripcion: textSection(),
  objetivo: textSection(),
  requisitos: textSection().optional(),
  funciones: vine
    .array(
      vine.object({
        nombre: vine.string().trim().minLength(1).maxLength(500),
        frecuencia: vine.string().trim().minLength(1).maxLength(100),
        atribucion: positionTemplateAttribution(),
      })
    )
    .minLength(1)
    .maxLength(30),
  competencias: vine
    .array(
      vine.object({
        nombre: vine.string().trim().minLength(1).maxLength(255),
        tipo: vine.enum(POSITION_TEMPLATE_COMPETENCY_TYPES),
        nivel_esperado: vine
          .number({ strict: true })
          .withoutDecimals()
          .in([...COMPETENCY_STANDARD_LEVEL_POSITIONS]),
        atribucion: positionTemplateAttribution(),
      })
    )
    .minLength(1)
    .maxLength(20),
  herramientas: vine
    .array(
      vine.object({
        nombre: vine.string().trim().minLength(1).maxLength(255),
        tipo_activo_sugerido: vine.object({
          nombre: vine.string().trim().minLength(1).maxLength(100),
          categoria_teletrabajo: vine.enum(POSITION_TEMPLATE_TELEWORK_CATEGORIES).optional(),
        }),
        atribucion: positionTemplateAttribution(),
      })
    )
    .maxLength(30)
    .optional(),
  certificaciones: vine
    .array(
      vine.object({
        nombre: vine.string().trim().minLength(1).maxLength(200),
        categoria: vine.enum(POSITION_TEMPLATE_CERTIFICATION_CATEGORY_KEYS),
        emisor: vine.string().trim().minLength(1).maxLength(100),
        id_en_emisor: vine.string().trim().minLength(1).maxLength(100).optional(),
        atribucion: positionTemplateAttribution(),
      })
    )
    .maxLength(20)
    .optional(),
})

/** Giro del catálogo curado ligado al SCIAN (VLRH-H1792205820286). */
export const positionTemplateIndustrySchema = vine.object({
  codigo: positionTemplateCode(),
  nombre: vine.string().trim().minLength(1).maxLength(150),
  codigo_scian: vine.string().trim().regex(POSITION_TEMPLATE_SCIAN_PATTERN),
  es_demo: vine.boolean({ strict: true }),
  tiene_estructura: vine.boolean({ strict: true }),
  atribucion: positionTemplateAttribution(),
})

/**
 * Estructura plantilla por giro y rango de empleados (VLRH-H1792205820286). La
 * jerarquía (claves únicas, una cima, sin ciclos) la valida
 * `position_template_structure.rules.ts`.
 */
export const positionTemplateOrgStructureSchema = vine.object({
  giro: positionTemplateCode(),
  rango_empleados: vine.enum(POSITION_TEMPLATE_EMPLOYEE_RANGES),
  areas: vine
    .array(
      vine.object({
        codigo: positionTemplateCode(),
        nombre: vine.string().trim().minLength(1).maxLength(150),
        puestos: vine
          .array(
            vine.object({
              clave: positionTemplateCode(),
              puesto: positionTemplateCode(),
              reporta_a: positionTemplateCode().optional(),
            })
          )
          .minLength(1)
          .maxLength(100),
      })
    )
    .minLength(1)
    .maxLength(50),
  atribucion: positionTemplateAttribution(),
})

/** Sobre del documento: puestos tipo, catálogo de giros y estructuras, en cualquier combinación. */
export const positionTemplateFileSchema = vine.object({
  version_formato: vine.literal(1),
  idioma: vine.literal('es'),
  descripcion: vine.string().trim().minLength(1).maxLength(500).optional(),
  puestos: vine.array(positionTemplateJobProfileSchema).maxLength(500).optional(),
  giros: vine.array(positionTemplateIndustrySchema).maxLength(500).optional(),
  estructuras: vine.array(positionTemplateOrgStructureSchema).maxLength(200).optional(),
})

export const positionTemplateFileValidator = vine.compile(positionTemplateFileSchema)
