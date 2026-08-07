import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { cuid } from '@adonisjs/core/helpers'
import EmployeeSupplie from '#models/employee_supplie'
import EmployeeSupplieAssignationPhoto from '#models/employee_supplie_assignation_photo'
import Supplie from '#models/supplie'
import SupplyType from '#models/supply_type'
import EmployeeSuppplyAssignamentPhotoService from '#services/employee_suppply_assignament_photo_service'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1785766406719 — deletePhoto debe acotar por el insumo asignado padre.
 * BU1 (sae) empleado 678 vs BU6 (cima) empleado 12.
 */

const BU6_EMPLOYEE_ID = 12

test.group('EmployeeSupplyAssignationPhotoService — aislamiento por tenant', (group) => {
  let supplyId: number
  let employeeSupplyBu6Id: number
  let photoBu6Id: number
  let createdSupplyId: number | null = null
  let createdSupplyTypeId: number | null = null

  group.setup(async () => {
    let catalogSupply = await Supplie.query().whereNull('supply_deleted_at').first()
    if (!catalogSupply) {
      const supplyType = await SupplyType.create({
        supplyTypeName: `Tipo de prueba ${cuid()}`,
        supplyTypeDescription: 'Tipo para pruebas de aislamiento',
        supplyTypeIdentifier: cuid(),
        supplyTypeSlug: `tipo-prueba-${cuid()}`,
      })
      createdSupplyTypeId = supplyType.supplyTypeId
      catalogSupply = await Supplie.create({
        supplyFileNumber: 900000000 + Math.floor(Math.random() * 99999999),
        supplyName: `Insumo de prueba ${cuid()}`,
        supplyDescription: 'Insumo para pruebas de aislamiento',
        supplyTypeId: supplyType.supplyTypeId,
        supplyStatus: 'active',
      })
      createdSupplyId = catalogSupply.supplyId
    }
    supplyId = catalogSupply.supplyId

    const employeeSupply = await TenantContext.run([6], async () => {
      const row = new EmployeeSupplie()
      row.employeeId = BU6_EMPLOYEE_ID
      row.businessUnitId = 6
      row.supplyId = supplyId
      row.employeeSupplyStatus = 'active'
      row.employeeSupplyAssignamentDate = DateTime.now()
      await row.save()
      return row
    })
    employeeSupplyBu6Id = employeeSupply.employeeSupplyId

    const photo = await TenantContext.runUnscoped(async () => {
      const p = new EmployeeSupplieAssignationPhoto()
      p.employeeSupplyId = employeeSupplyBu6Id
      p.employeeSupplieAssignationPhotoType = 'assignation'
      p.employeeSupplieAssignationPhotoFile = `test/supply-photo-${cuid()}.jpg`
      await p.save()
      return p
    }, 'fixture foto insumos BU6')
    photoBu6Id = photo.employeeSupplieAssignationPhotoId
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (photoBu6Id) {
        await EmployeeSupplieAssignationPhoto.query()
          .where('employeeSupplieAssignationPhotoId', photoBu6Id)
          .delete()
      }
      if (employeeSupplyBu6Id) {
        await EmployeeSupplie.query().where('employeeSupplyId', employeeSupplyBu6Id).delete()
      }
      if (createdSupplyId) {
        await Supplie.query().where('supplyId', createdSupplyId).delete()
      }
      if (createdSupplyTypeId) {
        await SupplyType.query().where('supplyTypeId', createdSupplyTypeId).delete()
      }
    }, 'limpieza test fotos insumos')
  })

  test('getPhotosByType con contexto BU1 no ve insumo de BU6', async ({ assert }) => {
    const service = new EmployeeSuppplyAssignamentPhotoService()
    const result = await TenantContext.run([1], () =>
      service.getPhotosByType(employeeSupplyBu6Id, 'assignation')
    )

    assert.equal(result.status, 404)
    assert.equal(result.title, 'Employee supply not found')
    assert.isNull(result.data)
  })

  test('deletePhoto con contexto BU1 no borra foto de BU6', async ({ assert }) => {
    const service = new EmployeeSuppplyAssignamentPhotoService()
    const fakeUpload = {
      deleteFile: async () => {
        throw new Error('no debe llamar a S3 en borrado denegado')
      },
    }

    const result = await TenantContext.run([1], () =>
      service.deletePhoto(photoBu6Id, fakeUpload as any)
    )

    assert.equal(result.status, 404)
    assert.equal(result.title, 'Photo not found')

    const stillAlive = await TenantContext.runUnscoped(
      () =>
        EmployeeSupplieAssignationPhoto.query()
          .where('employeeSupplieAssignationPhotoId', photoBu6Id)
          .whereNull('employee_supplie_assignation_photo_deleted_at')
          .first(),
      'verificación post-delete denegado'
    )
    assert.isNotNull(stillAlive)
  })

  test('getPhotosByType con contexto BU6 sí lista la foto propia', async ({ assert }) => {
    const service = new EmployeeSuppplyAssignamentPhotoService()
    const result = await TenantContext.run([6], () =>
      service.getPhotosByType(employeeSupplyBu6Id, 'assignation')
    )

    assert.equal(result.status, 200)
    assert.isArray(result.data)
    assert.lengthOf(result.data as any[], 1)
  })
})
