import AssessmentTemplate from '#models/assessment_template'
import AssessmentTemplateDimension, {
  type AssessmentTemplateDimensionDataType,
} from '#models/assessment_template_dimension'
import { AssessmentTemplateFilterSearchInterface } from '../interfaces/assessment_template_filter_search_interface.js'

/**
 * Forma esperada de cada dimensión cuando se envía como parte del payload
 * de creación/actualización de una plantilla. Incluye soporte para
 * `assessmentTemplateDimensionDataType` (CAP-02-08-01).
 */
type DimensionPayload = {
  assessmentTemplateDimensionId?: number
  assessmentTemplateDimensionName: string
  assessmentTemplateDimensionAcronym: string
  assessmentTemplateDimensionDataType?: AssessmentTemplateDimensionDataType
}

/**
 * Servicio que administra el ciclo de vida de las plantillas de evaluación
 * (`AssessmentTemplate`) y de sus dimensiones asociadas
 * (`AssessmentTemplateDimension`). Toda eliminación se realiza como
 * "soft delete" (se llena la columna `deleted_at`).
 *
 * Cada operación de creación o actualización opera en cascada con las
 * dimensiones enviadas en el payload, manteniendo la integridad de los datos
 * existentes mediante el método privado `syncDimensions`.
 */
export default class AssessmentTemplateService {
  /**
   * Devuelve un listado paginado de plantillas activas. Soporta filtro por
   * nombre (búsqueda case-insensitive con `LIKE %term%`) y precarga las
   * dimensiones activas de cada plantilla. Solo se seleccionan los campos
   * imprescindibles para listados (`assessment_template_id`,
   * `assessment_template_name`, `assessment_template_description`,
   * `assessment_template_created_at`).
   *
   * @param filters Filtros de búsqueda y paginación (search, page, limit).
   * @returns Resultado paginado de Lucid con las plantillas encontradas.
   */
  async index(filters: AssessmentTemplateFilterSearchInterface) {
    const selectedColumns = [
      'assessment_template_id',
      'assessment_template_name',
      'assessment_template_description',
      'assessment_template_is_active',
      'assessment_template_created_at',
    ]
    const status = filters.status ?? 'active'
    const items = await AssessmentTemplate.query()
      .whereNull('assessment_template_deleted_at')
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(assessment_template_name) LIKE ?', [
          `%${filters.search!.toUpperCase()}%`,
        ])
      })
      .if(status === 'active', (query) => {
        query.where('assessment_template_is_active', true)
      })
      .if(status === 'inactive', (query) => {
        query.where('assessment_template_is_active', false)
      })
      .preload('dimensions', (dimQuery) => {
        dimQuery.whereNull('assessment_template_dimension_deleted_at')
      })
      .select(selectedColumns)
      .orderBy('assessment_template_created_at', 'desc')
      .paginate(filters.page, filters.limit)

    return items
  }

  /**
   * Activa o desactiva una plantilla sin tocar el resto de sus campos.
   * El soft-delete sigue siendo el mecanismo para retirar definitivamente
   * una plantilla; este método sólo conmuta `is_active` (CAP-02-08-01).
   *
   * @param currentTemplate Instancia ya cargada de la plantilla.
   * @param isActive Nuevo valor de `is_active`.
   * @returns La plantilla actualizada.
   */
  async toggleStatus(currentTemplate: AssessmentTemplate, isActive: boolean) {
    currentTemplate.assessmentTemplateIsActive = isActive
    await currentTemplate.save()
    return currentTemplate
  }

  /**
   * Crea una nueva plantilla de evaluación y, opcionalmente, sus dimensiones
   * iniciales. Tras persistir las dimensiones, recarga la relación
   * `dimensions` (filtrando las activas) en la instancia retornada.
   *
   * @param data Datos básicos de la plantilla (nombre y descripción opcional).
   * @param dimensions Lista opcional de dimensiones a crear junto con la
   *                   plantilla (cada una con nombre, acrónimo y dataType opcional).
   * @returns La plantilla recién creada con sus dimensiones precargadas.
   */
  async create(
    data: { assessmentTemplateName: string; assessmentTemplateDescription?: string | null },
    dimensions?: DimensionPayload[]
  ) {
    const newTemplate = new AssessmentTemplate()
    newTemplate.assessmentTemplateName = data.assessmentTemplateName
    newTemplate.assessmentTemplateDescription = data.assessmentTemplateDescription ?? null
    await newTemplate.save()

    if (dimensions && dimensions.length > 0) {
      for (const dim of dimensions) {
        const newDim = new AssessmentTemplateDimension()
        newDim.assessmentTemplateId = newTemplate.assessmentTemplateId
        newDim.assessmentTemplateDimensionName = dim.assessmentTemplateDimensionName
        newDim.assessmentTemplateDimensionAcronym = dim.assessmentTemplateDimensionAcronym
        if (dim.assessmentTemplateDimensionDataType) {
          newDim.assessmentTemplateDimensionDataType = dim.assessmentTemplateDimensionDataType
        }
        await newDim.save()
      }
    }

    await newTemplate.load('dimensions', (dimQuery) => {
      dimQuery.whereNull('assessment_template_dimension_deleted_at')
    })

    return newTemplate
  }

  /**
   * Actualiza una plantilla de evaluación existente. Si se envía el array
   * `dimensions`, se sincroniza el conjunto completo (ver `syncDimensions`):
   * - Las dimensiones que ya no están en el array reciben soft delete.
   * - Las dimensiones presentes con `assessmentTemplateDimensionId` se actualizan.
   * - Las dimensiones presentes sin id se crean.
   *
   * @param currentTemplate Plantilla actual obtenida desde el controlador.
   * @param data Nuevos valores de nombre y descripción.
   * @param dimensions Lista opcional de dimensiones a sincronizar.
   * @returns La plantilla actualizada con sus dimensiones activas precargadas.
   */
  async update(
    currentTemplate: AssessmentTemplate,
    data: { assessmentTemplateName: string; assessmentTemplateDescription?: string | null },
    dimensions?: DimensionPayload[]
  ) {
    currentTemplate.assessmentTemplateName = data.assessmentTemplateName
    currentTemplate.assessmentTemplateDescription = data.assessmentTemplateDescription ?? null
    await currentTemplate.save()

    if (dimensions) {
      await this.syncDimensions(currentTemplate.assessmentTemplateId, dimensions)
    }

    await currentTemplate.load('dimensions', (dimQuery) => {
      dimQuery.whereNull('assessment_template_dimension_deleted_at')
    })

    return currentTemplate
  }

  /**
   * Sincroniza las dimensiones de una plantilla: crea nuevas, actualiza existentes y elimina las ausentes.
   */
  private async syncDimensions(assessmentTemplateId: number, dimensions: DimensionPayload[]) {
    const existingDimensions = await AssessmentTemplateDimension.query()
      .where('assessment_template_id', assessmentTemplateId)
      .whereNull('assessment_template_dimension_deleted_at')

    const incomingIds = dimensions
      .filter((d) => d.assessmentTemplateDimensionId)
      .map((d) => d.assessmentTemplateDimensionId!)

    // Soft-delete de las dimensiones que ya no están en el array
    for (const existing of existingDimensions) {
      if (!incomingIds.includes(existing.assessmentTemplateDimensionId)) {
        await existing.delete()
      }
    }

    for (const dim of dimensions) {
      if (dim.assessmentTemplateDimensionId) {
        const existing = existingDimensions.find(
          (e) => e.assessmentTemplateDimensionId === dim.assessmentTemplateDimensionId
        )
        if (existing) {
          existing.assessmentTemplateDimensionName = dim.assessmentTemplateDimensionName
          existing.assessmentTemplateDimensionAcronym = dim.assessmentTemplateDimensionAcronym
          if (dim.assessmentTemplateDimensionDataType) {
            existing.assessmentTemplateDimensionDataType = dim.assessmentTemplateDimensionDataType
          }
          await existing.save()
        }
      } else {
        const newDim = new AssessmentTemplateDimension()
        newDim.assessmentTemplateId = assessmentTemplateId
        newDim.assessmentTemplateDimensionName = dim.assessmentTemplateDimensionName
        newDim.assessmentTemplateDimensionAcronym = dim.assessmentTemplateDimensionAcronym
        if (dim.assessmentTemplateDimensionDataType) {
          newDim.assessmentTemplateDimensionDataType = dim.assessmentTemplateDimensionDataType
        }
        await newDim.save()
      }
    }
  }

  /**
   * Realiza un soft delete sobre la plantilla y cada una de sus dimensiones
   * activas (`assessment_template_dimension_deleted_at` se rellena).
   *
   * @param currentTemplate Plantilla a eliminar lógicamente.
   * @returns La misma instancia recibida (ya marcada como eliminada).
   */
  async delete(currentTemplate: AssessmentTemplate) {
    const dimensions = await AssessmentTemplateDimension.query()
      .where('assessment_template_id', currentTemplate.assessmentTemplateId)
      .whereNull('assessment_template_dimension_deleted_at')

    for (const dim of dimensions) {
      await dim.delete()
    }

    await currentTemplate.delete()
    return currentTemplate
  }

  /**
   * Obtiene una plantilla por su identificador con sus dimensiones activas
   * precargadas.
   *
   * @param assessmentTemplateId Identificador de la plantilla.
   * @returns La plantilla encontrada o `null` si no existe / fue eliminada.
   */
  async show(assessmentTemplateId: number) {
    const template = await AssessmentTemplate.query()
      .whereNull('assessment_template_deleted_at')
      .where('assessment_template_id', assessmentTemplateId)
      .preload('dimensions', (dimQuery) => {
        dimQuery.whereNull('assessment_template_dimension_deleted_at')
      })
      .first()
    return template ?? null
  }
}
