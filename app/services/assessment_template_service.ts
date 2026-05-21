import AssessmentTemplate from '#models/assessment_template'
import AssessmentTemplateDimension, {
  type AssessmentTemplateDimensionDataType,
} from '#models/assessment_template_dimension'
import db from '@adonisjs/lucid/services/db'
import { AssessmentTemplateFilterSearchInterface } from '../interfaces/assessment_template_filter_search_interface.js'

/**
 * Resultado del método `reorderDimensions`.
 * `ok: true` indica reorden exitoso (200); `ok: false` reporta una violación
 * de regla de negocio que el controlador traduce a 422 con la `key` indicada.
 */
export type ReorderDimensionsResult =
  | { ok: true; dimensions: AssessmentTemplateDimension[] }
  | {
      ok: false
      key: 'dimension-fuera-de-template' | 'indices-duplicados'
      offendingDimensionIds?: number[]
      duplicatedIndexes?: number[]
    }

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
  /**
   * Orden explícito (0-based) que el cliente puede enviar al crear/sincronizar
   * dimensiones. Si se omite, el servicio usa la posición del array.
   */
  assessmentTemplateDimensionOrderIndex?: number
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
        dimQuery
          .whereNull('assessment_template_dimension_deleted_at')
          .orderBy('assessment_template_dimension_order_index', 'asc')
          .orderBy('assessment_template_dimension_id', 'asc')
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
      let position = 0
      for (const dim of dimensions) {
        const newDim = new AssessmentTemplateDimension()
        newDim.assessmentTemplateId = newTemplate.assessmentTemplateId
        newDim.assessmentTemplateDimensionName = dim.assessmentTemplateDimensionName
        newDim.assessmentTemplateDimensionAcronym = dim.assessmentTemplateDimensionAcronym
        if (dim.assessmentTemplateDimensionDataType) {
          newDim.assessmentTemplateDimensionDataType = dim.assessmentTemplateDimensionDataType
        }
        newDim.assessmentTemplateDimensionOrderIndex =
          dim.assessmentTemplateDimensionOrderIndex ?? position
        await newDim.save()
        position += 1
      }
    }

    await newTemplate.load('dimensions', (dimQuery) => {
      dimQuery
        .whereNull('assessment_template_dimension_deleted_at')
        .orderBy('assessment_template_dimension_order_index', 'asc')
        .orderBy('assessment_template_dimension_id', 'asc')
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
      dimQuery
        .whereNull('assessment_template_dimension_deleted_at')
        .orderBy('assessment_template_dimension_order_index', 'asc')
        .orderBy('assessment_template_dimension_id', 'asc')
    })

    return currentTemplate
  }

  /**
   * Sincroniza las dimensiones de una plantilla: crea nuevas, actualiza
   * existentes y elimina las ausentes. La posición en el array recibido se
   * traduce a `assessment_template_dimension_order_index` (0-based) cuando
   * el cliente no envía explícitamente `assessmentTemplateDimensionOrderIndex`.
   */
  private async syncDimensions(assessmentTemplateId: number, dimensions: DimensionPayload[]) {
    const existingDimensions = await AssessmentTemplateDimension.query()
      .where('assessment_template_id', assessmentTemplateId)
      .whereNull('assessment_template_dimension_deleted_at')

    const incomingIds = dimensions
      .filter((d) => d.assessmentTemplateDimensionId)
      .map((d) => d.assessmentTemplateDimensionId!)

    for (const existing of existingDimensions) {
      if (!incomingIds.includes(existing.assessmentTemplateDimensionId)) {
        await existing.delete()
      }
    }

    let position = 0
    for (const dim of dimensions) {
      const orderIndex = dim.assessmentTemplateDimensionOrderIndex ?? position
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
          existing.assessmentTemplateDimensionOrderIndex = orderIndex
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
        newDim.assessmentTemplateDimensionOrderIndex = orderIndex
        await newDim.save()
      }
      position += 1
    }
  }

  /**
   * Reordena de forma atómica las dimensiones de una plantilla
   * (CAP-02-08-XX). Verifica que:
   *  1. Todos los `dimensionId` recibidos pertenezcan a la plantilla y
   *     estén activos. En caso contrario, devuelve
   *     `{ ok: false, key: 'dimension-fuera-de-template' }`.
   *  2. Los `orderIndex` no estén repetidos. En caso contrario, devuelve
   *     `{ ok: false, key: 'indices-duplicados' }`.
   *
   * Si las verificaciones pasan, los nuevos `orderIndex` se persisten en una
   * sola transacción para evitar estados intermedios inconsistentes.
   *
   * @param assessmentTemplateId Plantilla cuyas dimensiones se reordenan.
   * @param ordering Lista de tuplas { dimensionId, orderIndex }.
   * @returns Resultado tipado (ok=true con dimensiones recargadas, o
   *          ok=false con la `key` de error y los IDs/indices ofensores).
   */
  async reorderDimensions(
    assessmentTemplateId: number,
    ordering: { dimensionId: number; orderIndex: number }[]
  ): Promise<ReorderDimensionsResult> {
    const indexCounts = new Map<number, number>()
    for (const item of ordering) {
      indexCounts.set(item.orderIndex, (indexCounts.get(item.orderIndex) ?? 0) + 1)
    }
    const duplicatedIndexes = Array.from(indexCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([idx]) => idx)
    if (duplicatedIndexes.length > 0) {
      return { ok: false, key: 'indices-duplicados', duplicatedIndexes }
    }

    const incomingIds = ordering.map((o) => o.dimensionId)
    const existingDimensions = await AssessmentTemplateDimension.query()
      .where('assessment_template_id', assessmentTemplateId)
      .whereNull('assessment_template_dimension_deleted_at')
      .whereIn('assessment_template_dimension_id', incomingIds)

    const validIds = new Set(
      existingDimensions.map((d) => d.assessmentTemplateDimensionId)
    )
    const offendingDimensionIds = incomingIds.filter((id) => !validIds.has(id))
    if (offendingDimensionIds.length > 0) {
      return { ok: false, key: 'dimension-fuera-de-template', offendingDimensionIds }
    }

    await db.transaction(async (trx) => {
      for (const item of ordering) {
        const dim = existingDimensions.find(
          (d) => d.assessmentTemplateDimensionId === item.dimensionId
        )!
        dim.useTransaction(trx)
        dim.assessmentTemplateDimensionOrderIndex = item.orderIndex
        await dim.save()
      }
    })

    const refreshed = await AssessmentTemplateDimension.query()
      .where('assessment_template_id', assessmentTemplateId)
      .whereNull('assessment_template_dimension_deleted_at')
      .orderBy('assessment_template_dimension_order_index', 'asc')
      .orderBy('assessment_template_dimension_id', 'asc')

    return { ok: true, dimensions: refreshed }
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
        dimQuery
          .whereNull('assessment_template_dimension_deleted_at')
          .orderBy('assessment_template_dimension_order_index', 'asc')
          .orderBy('assessment_template_dimension_id', 'asc')
      })
      .first()
    return template ?? null
  }
}
