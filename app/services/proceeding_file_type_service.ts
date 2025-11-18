import ProceedingFileType from '#models/proceeding_file_type'
import ProceedingFileTypeProperty from '#models/proceeding_file_type_property'
import { ProceedingFileTypeFilterSearchInterface } from '../interfaces/proceeding_file_type_filter_search_interface.js'
import env from '#start/env'

export default class ProceedingFileTypeService {
  async index(filters: ProceedingFileTypeFilterSearchInterface) {
    const systemBussines = env.get('SYSTEM_BUSINESS')
    const systemBussinesArray = systemBussines?.toString().split(',') as Array<string>
    const proceedingFileTypes = await ProceedingFileType.query()
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(proceeding_file_type_name) LIKE ?', [
          `%${filters.search.toUpperCase()}%`,
        ])
      })
      .andWhere((query) => {
        query.whereNotNull('proceeding_file_type_business_units')
        query.andWhere((subQuery) => {
          systemBussinesArray.forEach((business) => {
            subQuery.orWhereRaw('FIND_IN_SET(?, proceeding_file_type_business_units)', [
              business.trim(),
            ])
          })
        })
      })
      .orderBy('proceeding_file_type_name', 'asc')
      .whereNull('parent_id')
      .paginate(filters.page, filters.limit)
    return proceedingFileTypes
  }

  async indexByArea(areaToUse: string) {
    const systemBussines = env.get('SYSTEM_BUSINESS')
    const systemBussinesArray = systemBussines?.toString().split(',') as Array<string>
    const proceedingFileTypes = await ProceedingFileType.query()
      .if(areaToUse, (query) => {
        query.where('proceeding_file_type_area_to_use', areaToUse)
      })
      .andWhere((query) => {
        query.whereNotNull('proceeding_file_type_business_units')
        query.andWhere((subQuery) => {
          systemBussinesArray.forEach((business) => {
            subQuery.orWhereRaw('FIND_IN_SET(?, proceeding_file_type_business_units)', [
              business.trim(),
            ])
          })
        })
      })
      .whereNull('parent_id')
      .preload('children')
      .orderBy('proceeding_file_type_name', 'asc')
    return proceedingFileTypes
  }

  async store(proceedingFileType: ProceedingFileType) {
    const newProceedingFileType = new ProceedingFileType()
    newProceedingFileType.proceedingFileTypeName = proceedingFileType.proceedingFileTypeName
    newProceedingFileType.proceedingFileTypeSlug = proceedingFileType.proceedingFileTypeSlug
    newProceedingFileType.proceedingFileTypeAreaToUse =
      proceedingFileType.proceedingFileTypeAreaToUse
    newProceedingFileType.proceedingFileTypeActive = proceedingFileType.proceedingFileTypeActive
    await newProceedingFileType.save()
    return newProceedingFileType
  }

  async update(
    currenProceedingFileType: ProceedingFileType,
    proceedingFileType: ProceedingFileType
  ) {
    currenProceedingFileType.proceedingFileTypeName = proceedingFileType.proceedingFileTypeName
    currenProceedingFileType.proceedingFileTypeSlug = proceedingFileType.proceedingFileTypeSlug
    currenProceedingFileType.proceedingFileTypeAreaToUse =
      proceedingFileType.proceedingFileTypeAreaToUse
    currenProceedingFileType.proceedingFileTypeActive = proceedingFileType.proceedingFileTypeActive
    await currenProceedingFileType.save()
    return currenProceedingFileType
  }

  async delete(currenProceedingFileType: ProceedingFileType) {
    await currenProceedingFileType.delete()
    return currenProceedingFileType
  }

  async show(proceedingFileTypeId: number) {
    const proceedingFileType = await ProceedingFileType.query()
      .whereNull('proceeding_file_type_deleted_at')
      .where('proceeding_file_type_id', proceedingFileTypeId)
      .preload('children')
      .preload('emails')
      .first()
    return proceedingFileType ? proceedingFileType : null
  }

  async getLegacyEmails(proceedingFileTypeId: number) {
    const emails = await this.getAllEmailParents(proceedingFileTypeId)
    return emails
  }

  async getAllEmailParents(proceedingFileTypeId: number) {
    const emails = []
    let currentRecord = await ProceedingFileType.find(proceedingFileTypeId)
    while (currentRecord && currentRecord.parentId) {
      const parent = await currentRecord.related('parent').query().preload('emails').first()
      if (parent) {
        for await (const email of parent.emails) {
          emails.push(email)
        }
        currentRecord = parent
      } else {
        break
      }
    }
    return emails
  }

  async verifyInfo(proceedingFileType: ProceedingFileType) {
    const action = proceedingFileType.proceedingFileTypeId > 0 ? 'updated' : 'created'
    const existProceedingFileTypeName = await ProceedingFileType.query()
      .if(proceedingFileType.proceedingFileTypeId > 0, (query) => {
        query.whereNot('proceedingFileTypeId', proceedingFileType.proceedingFileTypeId)
      })
      .whereNull('deletedAt')
      .where('proceedingFileTypeName', proceedingFileType.proceedingFileTypeName)
      .where('proceedingFileTypeAreaToUse', proceedingFileType.proceedingFileTypeAreaToUse)
      .first()
    if (existProceedingFileTypeName && proceedingFileType.proceedingFileTypeName) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file type name exists for another proceeding file type',
        message: `The proceeding file type resource cannot be ${action} because the roceeding file type name is already assigned to another proceeding file type`,
        data: { ...proceedingFileType },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...proceedingFileType },
    }
  }

  /**
   * Genera un slug a partir del nombre del tipo de archivo de procedimiento
   * @param name - Nombre del tipo de archivo de procedimiento
   * @returns Slug generado
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-') // Reemplaza espacios con guiones
      .replace(/[^\w\-]+/g, '') // Elimina caracteres especiales excepto guiones
      .replace(/\-\-+/g, '-') // Reemplaza múltiples guiones con uno solo
      .replace(/^-+/, '') // Elimina guiones al inicio
      .replace(/-+$/, '') // Elimina guiones al final
  }

  /**
   * Crea un nuevo tipo de archivo de procedimiento para empleados con generación automática de slug
   * @param data - Datos para crear el tipo de archivo de procedimiento
   * @returns Resultado de la operación
   */
  async createEmployeeType(data: {
    proceedingFileTypeName: string
    parentId?: number
    proceedingFileTypeActive?: boolean
  }) {
    try {
      // Validar que el parentId existe si se proporciona
      if (data.parentId) {
        const parentExists = await ProceedingFileType.query()
          .whereNull('proceeding_file_type_deleted_at')
          .where('proceeding_file_type_id', data.parentId)
          .where('proceeding_file_type_area_to_use', 'employee')
          .first()

        if (!parentExists) {
          return {
            status: 404,
            type: 'warning',
            title: 'Parent proceeding file type not found',
            message: 'The parent proceeding file type was not found or is not an employee type',
            data: { parentId: data.parentId },
          }
        }
      }

      // Generar slug automáticamente
      const generatedSlug = this.generateSlug(data.proceedingFileTypeName)

      // Verificar que el slug no exista
      const existingSlug = await ProceedingFileType.query()
        .whereNull('proceeding_file_type_deleted_at')
        .where('proceeding_file_type_slug', generatedSlug)
        .where('proceeding_file_type_area_to_use', 'employee')
        .first()

      if (existingSlug) {
        return {
          status: 400,
          type: 'warning',
          title: 'Slug already exists',
          message: 'A proceeding file type with this slug already exists for employee area',
          data: { slug: generatedSlug },
        }
      }

      // Obtener las business units del sistema desde la variable de entorno
      const systemBusiness = env.get('SYSTEM_BUSINESS')
      const systemBusinessArray = systemBusiness?.toString().split(',') as Array<string>
      const businessUnitsString = systemBusinessArray.join(',')

      // Crear el nuevo tipo de archivo de procedimiento
      const newProceedingFileType = new ProceedingFileType()
      newProceedingFileType.proceedingFileTypeName = data.proceedingFileTypeName
      newProceedingFileType.proceedingFileTypeSlug = generatedSlug
      newProceedingFileType.proceedingFileTypeAreaToUse = 'employee'
      newProceedingFileType.proceedingFileTypeActive = data.proceedingFileTypeActive ? 1 : 0
      newProceedingFileType.proceedingFileTypeBusinessUnits = businessUnitsString
      newProceedingFileType.parentId = data.parentId || null

      await newProceedingFileType.save()

      // Crear la propiedad por defecto para el nuevo tipo
      const defaultProperty = new ProceedingFileTypeProperty()
      defaultProperty.proceedingFileTypePropertyName = 'Información General'
      defaultProperty.proceedingFileTypePropertyType = 'Text'
      defaultProperty.proceedingFileTypePropertyCategoryName = '' // Como solicitaste, dejamos vacío en lugar de null
      defaultProperty.proceedingFileTypeId = newProceedingFileType.proceedingFileTypeId

      await defaultProperty.save()

      return {
        status: 201,
        type: 'success',
        title: 'Proceeding file type created successfully',
        message: 'The employee proceeding file type was created successfully with its default property',
        data: {
          proceedingFileType: newProceedingFileType,
          proceedingFileTypeProperty: defaultProperty,
        },
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error occurred while creating the proceeding file type',
        data: { error: error.message },
      }
    }
  }
}
