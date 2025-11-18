import ProceedingFileTypeProperty from '#models/proceeding_file_type_property'
import ProceedingFileTypePropertyValue from '#models/proceeding_file_type_property_value'
import ProceedingFileType from '#models/proceeding_file_type'
import { ProceedingFileTypePropertyCategoryFilterInterface } from '../interfaces/proceeding_file_type_property_category_filter_interface.js'
import { ProceedingFileTypePropertyFilterSearchInterface } from '../interfaces/proceeding_file_type_property_filter_search_interface.js'
import { ProceedingFileTypePropertyValueValueInterface } from '../interfaces/proceeding_file_type_property_value_value_interface.js'

export default class ProceedingFileTypePropertyService {
  async index(filters: ProceedingFileTypePropertyFilterSearchInterface) {
    const proceedingFileTypeProperties = await ProceedingFileTypeProperty.query()
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(proeceeding_file_type_property_name) LIKE ?', [
          `%${filters.search.toUpperCase()}%`,
        ])
        query.orWhereRaw('UPPER(proeceeding_file_type_property_type) LIKE ?', [
          `%${filters.search.toUpperCase()}%`,
        ])
      })
      .orderBy('proeceeding_file_type_property_id')
      .paginate(filters.page, filters.limit)
    return proceedingFileTypeProperties
  }

  async getCategories(
    proceedingFileTypePropertyCategoryFilter: ProceedingFileTypePropertyCategoryFilterInterface
  ) {
    const proceedingFileTypePropertyValueCategories = await ProceedingFileTypeProperty.query()
      .select(
        'proceedingFileTypePropertyCategoryName',
        'proceedingFileTypePropertyName',
        'proceedingFileTypePropertyType'
      )
      .where(
        'proceeding_file_type_id',
        proceedingFileTypePropertyCategoryFilter.proceedingFileTypeId
      )
      .orderBy('proceedingFileTypePropertyCategoryName', 'asc')
    const categories: {
      [key: string]: {
        name: string
        type: string
        values: ProceedingFileTypePropertyValueValueInterface[]
        proceedingFileTypePropertyId: number
      }[]
    } = {}

    for (const item of proceedingFileTypePropertyValueCategories) {
      const {
        proceedingFileTypePropertyCategoryName,
        proceedingFileTypePropertyName,
        proceedingFileTypePropertyType,
      } = item

      if (!categories[proceedingFileTypePropertyCategoryName]) {
        categories[proceedingFileTypePropertyCategoryName] = []
      }
      const numericTypes = ['Number', 'Decimal', 'Currency']
      const proceedingFileTypeProperty = await ProceedingFileTypeProperty.query()
        .where('proceedingFileTypePropertyCategoryName', proceedingFileTypePropertyCategoryName)
        .where('proceedingFileTypePropertyName', proceedingFileTypePropertyName)
        .where('proceedingFileTypePropertyType', proceedingFileTypePropertyType)
        .first()
      const values = [] as Array<ProceedingFileTypePropertyValueValueInterface>
      if (proceedingFileTypeProperty) {
        const proceedingFileTypePropertyValues = await ProceedingFileTypePropertyValue.query()
          .whereNull('proceeding_file_type_property_value_deleted_at')
          .where('employeeId', proceedingFileTypePropertyCategoryFilter.employeeId)
          .where('proceedingFileId', proceedingFileTypePropertyCategoryFilter.proceedingFileId)
          .where(
            'proceedingFileTypePropertyId',
            proceedingFileTypeProperty.proceedingFileTypePropertyId
          )
          .where('proceedingFileTypePropertyValueActive', 1)
          .orderBy('proceedingFileTypePropertyId')
        if (proceedingFileTypePropertyValues && proceedingFileTypePropertyValues.length > 0) {
          for await (const proceedingFileTypePropertyValue of proceedingFileTypePropertyValues) {
            const newValue = {
              proceedingFileTypePropertyValueValue: numericTypes.includes(
                proceedingFileTypePropertyType
              )
                ? proceedingFileTypePropertyValue.proceedingFileTypePropertyValueValue
                  ? Number.parseFloat(
                      proceedingFileTypePropertyValue.proceedingFileTypePropertyValueValue
                    )
                  : 0
                : proceedingFileTypePropertyValue.proceedingFileTypePropertyValueValue,
              proceedingFileTypePropertyValueId:
                proceedingFileTypePropertyValue.proceedingFileTypePropertyValueId,
              files: [],
            }
            values.push(newValue)
          }
        } else {
          const newValue = {
            proceedingFileTypePropertyValueValue: numericTypes.includes(
              proceedingFileTypePropertyType
            )
              ? 0
              : '',
            proceedingFileTypePropertyValueId: 0,
            files: [],
          }
          values.push(newValue)
        }
        categories[proceedingFileTypePropertyCategoryName].push({
          name: proceedingFileTypePropertyName,
          type: proceedingFileTypePropertyType,
          values: values,
          proceedingFileTypePropertyId: proceedingFileTypeProperty.proceedingFileTypePropertyId,
        })
      }
    }
    return categories
  }

  /**
   * Crea una nueva propiedad para un tipo de archivo de procedimiento
   * @param data - Datos de la propiedad a crear
   * @returns Resultado de la operación
   */
  async store(data: {
    proceedingFileTypePropertyName: string
    proceedingFileTypePropertyType: string
    proceedingFileTypePropertyCategoryName?: string
    proceedingFileTypeId: number
  }) {
    try {
      // Verificar que el tipo de archivo de procedimiento existe
      const proceedingFileType = await ProceedingFileType.query()
        .whereNull('proceeding_file_type_deleted_at')
        .where('proceeding_file_type_id', data.proceedingFileTypeId)
        .first()

      if (!proceedingFileType) {
        return {
          status: 404,
          type: 'warning',
          title: 'Proceeding file type not found',
          message: 'The proceeding file type was not found',
          data: { proceedingFileTypeId: data.proceedingFileTypeId },
        }
      }

      // Verificar que no existe una propiedad con el mismo nombre para este tipo
      const existingProperty = await ProceedingFileTypeProperty.query()
        .whereNull('proceeding_file_type_property_deleted_at')
        .where('proceeding_file_type_id', data.proceedingFileTypeId)
        .where('proceeding_file_type_property_name', data.proceedingFileTypePropertyName)
        .first()

      if (existingProperty) {
        return {
          status: 400,
          type: 'warning',
          title: 'Property name already exists',
          message: 'A property with this name already exists for this proceeding file type',
          data: { proceedingFileTypePropertyName: data.proceedingFileTypePropertyName },
        }
      }

      // Crear la nueva propiedad
      const newProperty = new ProceedingFileTypeProperty()
      newProperty.proceedingFileTypePropertyName = data.proceedingFileTypePropertyName
      newProperty.proceedingFileTypePropertyType = data.proceedingFileTypePropertyType
      newProperty.proceedingFileTypePropertyCategoryName = data.proceedingFileTypePropertyCategoryName || ''
      newProperty.proceedingFileTypeId = data.proceedingFileTypeId

      await newProperty.save()

      return {
        status: 201,
        type: 'success',
        title: 'Property created successfully',
        message: 'The proceeding file type property was created successfully',
        data: { proceedingFileTypeProperty: newProperty },
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error occurred while creating the property',
        data: { error: error.message },
      }
    }
  }

  /**
   * Crea múltiples propiedades para un tipo de archivo de procedimiento
   * @param data - Datos con el ID del tipo y las propiedades a crear
   * @returns Resultado de la operación
   */
  async storeMultiple(data: {
    proceedingFileTypeId: number
    properties: Array<{
      proceedingFileTypePropertyName: string
      proceedingFileTypePropertyType: string
      proceedingFileTypePropertyCategoryName?: string
    }>
  }) {
    try {
      // Verificar que el tipo de archivo de procedimiento existe
      const proceedingFileType = await ProceedingFileType.query()
        .whereNull('proceeding_file_type_deleted_at')
        .where('proceeding_file_type_id', data.proceedingFileTypeId)
        .first()

      if (!proceedingFileType) {
        return {
          status: 404,
          type: 'warning',
          title: 'Proceeding file type not found',
          message: 'The proceeding file type was not found',
          data: { proceedingFileTypeId: data.proceedingFileTypeId },
        }
      }

      const createdProperties = []
      const errors = []

      for (const propertyData of data.properties) {
        try {
          // Verificar que no existe una propiedad con el mismo nombre para este tipo
          const existingProperty = await ProceedingFileTypeProperty.query()
            .whereNull('proceeding_file_type_property_deleted_at')
            .where('proceeding_file_type_id', data.proceedingFileTypeId)
            .where('proceeding_file_type_property_name', propertyData.proceedingFileTypePropertyName)
            .first()

          if (existingProperty) {
            errors.push({
              propertyName: propertyData.proceedingFileTypePropertyName,
              error: 'Property name already exists for this proceeding file type',
            })
            continue
          }

          // Crear la nueva propiedad
          const newProperty = new ProceedingFileTypeProperty()
          newProperty.proceedingFileTypePropertyName = propertyData.proceedingFileTypePropertyName
          newProperty.proceedingFileTypePropertyType = propertyData.proceedingFileTypePropertyType
          newProperty.proceedingFileTypePropertyCategoryName = propertyData.proceedingFileTypePropertyCategoryName || ''
          newProperty.proceedingFileTypeId = data.proceedingFileTypeId

          await newProperty.save()
          createdProperties.push(newProperty)
        } catch (error) {
          errors.push({
            propertyName: propertyData.proceedingFileTypePropertyName,
            error: error.message,
          })
        }
      }

      if (errors.length > 0 && createdProperties.length === 0) {
        return {
          status: 400,
          type: 'warning',
          title: 'Failed to create properties',
          message: 'No properties could be created due to errors',
          data: { errors, createdProperties },
        }
      }

      return {
        status: 201,
        type: 'success',
        title: 'Properties created successfully',
        message: `${createdProperties.length} properties were created successfully`,
        data: {
          createdProperties,
          errors: errors.length > 0 ? errors : undefined,
        },
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error occurred while creating the properties',
        data: { error: error.message },
      }
    }
  }

  /**
   * Obtiene todas las propiedades de un tipo de archivo de procedimiento
   * @param proceedingFileTypeId - ID del tipo de archivo de procedimiento
   * @returns Lista de propiedades
   */
  async getByProceedingFileTypeId(proceedingFileTypeId: number) {
    try {
      const properties = await ProceedingFileTypeProperty.query()
        .whereNull('proceeding_file_type_property_deleted_at')
        .where('proceeding_file_type_id', proceedingFileTypeId)
        .orderBy('proceeding_file_type_property_name', 'asc')

      return {
        status: 200,
        type: 'success',
        title: 'Properties retrieved successfully',
        message: 'The proceeding file type properties were retrieved successfully',
        data: { properties },
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error occurred while retrieving the properties',
        data: { error: error.message },
      }
    }
  }

  /**
   * Elimina una propiedad de tipo de archivo de procedimiento (soft delete)
   * @param proceedingFileTypePropertyId - ID de la propiedad a eliminar
   * @returns Resultado de la operación
   */
  async delete(proceedingFileTypePropertyId: number) {
    try {
      // Verificar que la propiedad existe
      const property = await ProceedingFileTypeProperty.query()
        .whereNull('proceeding_file_type_property_deleted_at')
        .where('proceeding_file_type_property_id', proceedingFileTypePropertyId)
        .first()

      if (!property) {
        return {
          status: 404,
          type: 'warning',
          title: 'Property not found',
          message: 'The proceeding file type property was not found',
          data: { proceedingFileTypePropertyId },
        }
      }

      // Realizar soft delete
      await property.delete()

      return {
        status: 200,
        type: 'success',
        title: 'Property deleted successfully',
        message: 'The proceeding file type property was deleted successfully',
        data: { proceedingFileTypeProperty: property },
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error occurred while deleting the property',
        data: { error: error.message },
      }
    }
  }
}
