import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  proceedingFileTypeIsEmployeeArea,
  proceedingFileIsEmployeeArea,
  proceedingFileTypePropertyValueIsEmployeeArea,
} from '#helpers/proceeding_file_is_employee_area'

test.group('proceedingFileIsEmployeeArea helpers', (group) => {
  const createdTypeIds: number[] = []
  const createdFileIds: number[] = []
  const createdValueIds: number[] = []
  const createdPropertyIds: number[] = []

  group.teardown(async () => {
    if (createdValueIds.length) {
      await db.from('proceeding_file_type_property_values').whereIn('proceeding_file_type_property_value_id', createdValueIds).delete()
    }
    if (createdPropertyIds.length) {
      await db.from('proceeding_file_type_properties').whereIn('proceeding_file_type_property_id', createdPropertyIds).delete()
    }
    if (createdFileIds.length) {
      await db.from('proceeding_files').whereIn('proceeding_file_id', createdFileIds).delete()
    }
    if (createdTypeIds.length) {
      await db.from('proceeding_file_types').whereIn('proceeding_file_type_id', createdTypeIds).delete()
    }
  })

  async function createType(area: string) {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    const now = new Date()
    const insert = await db.table('proceeding_file_types').insert({
      proceeding_file_type_name: `PFType ${area} ${stamp}`,
      proceeding_file_type_slug: `pftype-${area}-${stamp}`,
      proceeding_file_type_area_to_use: area,
      proceeding_file_type_active: 1,
      proceeding_file_type_created_at: now,
      proceeding_file_type_updated_at: now,
    })
    const id = Number(insert[0])
    createdTypeIds.push(id)
    return id
  }

  async function createFile(typeId: number) {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    const now = new Date()
    const insert = await db.table('proceeding_files').insert({
      proceeding_file_name: `file-${stamp}`,
      proceeding_file_path: `proceeding-files/file-${stamp}.pdf`,
      proceeding_file_type_id: typeId,
      proceeding_file_active: 1,
      proceeding_file_uuid: `uuid-${stamp}`,
      proceeding_file_created_at: now,
      proceeding_file_updated_at: now,
    })
    const id = Number(insert[0])
    createdFileIds.push(id)
    return id
  }

  test('tipo employee → true; aircraft → false; ausente → false', async ({ assert }) => {
    const employeeTypeId = await createType('employee')
    const aircraftTypeId = await createType('aircraft')
    assert.isTrue(await proceedingFileTypeIsEmployeeArea(employeeTypeId))
    assert.isFalse(await proceedingFileTypeIsEmployeeArea(aircraftTypeId))
    assert.isFalse(await proceedingFileTypeIsEmployeeArea(0))
  })

  test('archivo hereda el área de su tipo', async ({ assert }) => {
    const employeeTypeId = await createType('employee')
    const pilotTypeId = await createType('pilot')
    const employeeFileId = await createFile(employeeTypeId)
    const pilotFileId = await createFile(pilotTypeId)
    assert.isTrue(await proceedingFileIsEmployeeArea(employeeFileId))
    assert.isFalse(await proceedingFileIsEmployeeArea(pilotFileId))
    assert.isFalse(await proceedingFileIsEmployeeArea(0))
  })

  test('valor de propiedad hereda el área del proceeding file', async ({ assert }) => {
    const employeeTypeId = await createType('employee')
    const customerTypeId = await createType('customer')
    const employeeFileId = await createFile(employeeTypeId)
    const customerFileId = await createFile(customerTypeId)

    const now = new Date()
    const propInsert = await db.table('proceeding_file_type_properties').insert({
      proceeding_file_type_id: employeeTypeId,
      proceeding_file_type_property_name: `prop-${Date.now()}`,
      proceeding_file_type_property_type: 'Text',
      proceeding_file_type_property_category_name: 'Test',
      proceeding_file_type_property_created_at: now,
      proceeding_file_type_property_updated_at: now,
    })
    const propertyId = Number(propInsert[0])
    createdPropertyIds.push(propertyId)

    const empValueInsert = await db.table('proceeding_file_type_property_values').insert({
      proceeding_file_type_property_id: propertyId,
      proceeding_file_id: employeeFileId,
      proceeding_file_type_property_value_value: 'ok',
      proceeding_file_type_property_value_active: 1,
      proceeding_file_type_property_value_created_at: now,
      proceeding_file_type_property_value_updated_at: now,
    })
    const empValueId = Number(empValueInsert[0])
    createdValueIds.push(empValueId)

    const custValueInsert = await db.table('proceeding_file_type_property_values').insert({
      proceeding_file_type_property_id: propertyId,
      proceeding_file_id: customerFileId,
      proceeding_file_type_property_value_value: 'other',
      proceeding_file_type_property_value_active: 1,
      proceeding_file_type_property_value_created_at: now,
      proceeding_file_type_property_value_updated_at: now,
    })
    const custValueId = Number(custValueInsert[0])
    createdValueIds.push(custValueId)

    assert.isTrue(await proceedingFileTypePropertyValueIsEmployeeArea(empValueId))
    assert.isFalse(await proceedingFileTypePropertyValueIsEmployeeArea(custValueId))
    assert.isFalse(await proceedingFileTypePropertyValueIsEmployeeArea(0))
  })
})
