import { BaseSeeder } from '@adonisjs/lucid/seeders'
import EmployeeRecordProperty from '../../app/models/employee_record_property.js'

export default class extends BaseSeeder {
  async run() {
    const employeeRecordProperties = [
      {
        employeeRecordPropertyId: 1,
        employeeRecordPropertyName: 'Idioma / Nivel',
        employeeRecordPropertyType: 'Text',
        employeeRecordPropertyCategoryName: 'Idiomas'
      },
      {
        employeeRecordPropertyId: 2,
        employeeRecordPropertyName: 'Primaria',
        employeeRecordPropertyType: 'Text',
        employeeRecordPropertyCategoryName: 'Formación Educativa'
      },
      {
        employeeRecordPropertyId: 3,
        employeeRecordPropertyName: 'Secundaria',
        employeeRecordPropertyType: 'Text',
        employeeRecordPropertyCategoryName: 'Formación Educativa'
      },
      {
        employeeRecordPropertyId: 4,
        employeeRecordPropertyName: 'Preparatoria',
        employeeRecordPropertyType: 'Text',
        employeeRecordPropertyCategoryName: 'Formación Educativa'
      },
      {
        employeeRecordPropertyId: 5,
        employeeRecordPropertyName: 'Universidad',
        employeeRecordPropertyType: 'Text',
        employeeRecordPropertyCategoryName: 'Formación Educativa'
      },
      {
        employeeRecordPropertyId: 6,
        employeeRecordPropertyName: 'Carrera',
        employeeRecordPropertyType: 'Text',
        employeeRecordPropertyCategoryName: 'Formación Educativa'
      },
      {
        employeeRecordPropertyId: 7,
        employeeRecordPropertyName: 'Maestría',
        employeeRecordPropertyType: 'Text',
        employeeRecordPropertyCategoryName: 'Formación Educativa'
      },
      {
        employeeRecordPropertyId: 8,
        employeeRecordPropertyName: 'Aptitud',
        employeeRecordPropertyType: 'Text',
        employeeRecordPropertyCategoryName: 'Aptitudes'
      },
      {
        employeeRecordPropertyId: 9,
        employeeRecordPropertyName: 'Conocimiento y/o Habilidad',
        employeeRecordPropertyType: 'Text',
        employeeRecordPropertyCategoryName: 'Conocimientos y/o Habilidades'
      },
      {
        employeeRecordPropertyId: 10,
        employeeRecordPropertyName: 'Tecnología / Nivel',
        employeeRecordPropertyType: 'Text',
        employeeRecordPropertyCategoryName: 'Conocimiento técnico / Informática'
      }
    ]

    for (const employeeRecordProperty of employeeRecordProperties) {
      const { employeeRecordPropertyId, ...employeeRecordPropertyData } = employeeRecordProperty
      await EmployeeRecordProperty.firstOrCreate({ employeeRecordPropertyId }, employeeRecordPropertyData)
    }
  }
}
