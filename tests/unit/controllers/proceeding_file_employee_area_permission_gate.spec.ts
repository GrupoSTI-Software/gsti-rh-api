import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.group('proceeding_file_controller — gate área employee antes de upload', () => {
  test('store/update/delete usan ensureSecondaryPermission y helpers de área', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'app/controllers/proceeding_file_controller.ts'),
      'utf8'
    )
    assert.include(content, 'ensureSecondaryPermission')
    assert.include(content, 'EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION')
    assert.include(content, 'EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION')
    assert.include(content, 'proceedingFileTypeIsEmployeeArea')
    assert.include(content, 'proceedingFileIsEmployeeArea')

    // En processProceedingFileMultipartStore, el gate debe aparecer antes del primer fileUpload
    const storeFnStart = content.indexOf('export async function processProceedingFileMultipartStore')
    const firstUpload = content.indexOf('fileUpload', storeFnStart)
    const gateInStore = content.indexOf('ensureSecondaryPermission', storeFnStart)
    assert.isTrue(storeFnStart >= 0)
    assert.isTrue(gateInStore >= 0 && gateInStore < firstUpload)

    // En update, el gate debe aparecer antes de fileUpload
    const updateStart = content.indexOf('async update(')
    const uploadInUpdate = content.indexOf('fileUpload', updateStart)
    const gateInUpdate = content.indexOf('ensureSecondaryPermission', updateStart)
    assert.isTrue(gateInUpdate >= 0 && gateInUpdate < uploadInUpdate)

    // En delete, el gate debe aparecer antes de la eliminación definitiva del registro
    const deleteStart = content.indexOf('async delete(')
    const serviceDeleteCall = content.indexOf('proceedingFileService.delete(', deleteStart)
    const gateInDelete = content.indexOf('ensureSecondaryPermission', deleteStart)
    assert.isTrue(deleteStart >= 0)
    assert.isTrue(gateInDelete >= 0 && gateInDelete < serviceDeleteCall)
  })
})

test.group('proceeding_file_type_property_value_controller — gate área employee', () => {
  test('store/update/delete usan ensureSecondaryPermission antes de fileUpload', async ({
    assert,
  }) => {
    const content = await readFile(
      join(process.cwd(), 'app/controllers/proceeding_file_type_property_value_controller.ts'),
      'utf8'
    )
    assert.include(content, 'ensureSecondaryPermission')
    assert.include(content, 'EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION')
    assert.include(content, 'EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION')
    assert.include(content, 'proceedingFileIsEmployeeArea')
    assert.include(content, 'proceedingFileTypePropertyValueIsEmployeeArea')

    const storeStart = content.indexOf('async store(')
    const firstUpload = content.indexOf('fileUpload', storeStart)
    const gateInStore = content.indexOf('ensureSecondaryPermission', storeStart)
    assert.isTrue(gateInStore >= 0 && gateInStore < firstUpload)

    const updateStart = content.indexOf('async update(')
    const uploadInUpdate = content.indexOf('fileUpload', updateStart)
    const gateInUpdate = content.indexOf('ensureSecondaryPermission', updateStart)
    assert.isTrue(gateInUpdate >= 0 && gateInUpdate < uploadInUpdate)

    const deletePropertyValueStart = content.indexOf('async delete(')
    const serviceDeleteCallPropertyValue = content.indexOf(
      'proceedingFileTypePropertyValueService.delete(',
      deletePropertyValueStart
    )
    const gateInDeletePropertyValue = content.indexOf(
      'ensureSecondaryPermission',
      deletePropertyValueStart
    )
    assert.isTrue(deletePropertyValueStart >= 0)
    assert.isTrue(
      gateInDeletePropertyValue >= 0 && gateInDeletePropertyValue < serviceDeleteCallPropertyValue
    )
  })
})
