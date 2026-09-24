import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { DateTime } from 'luxon'
import EmployeeSupplie from '#models/employee_supplie'
import EmployeeSupplieAssignationPhoto from '#models/employee_supplie_assignation_photo'
import Supplie from '#models/supplie'
import { MAX_ASSIGNATION_PHOTOS_PER_ASSIGNMENT } from './assets.constants.js'
import { AssetError } from './assets.error.js'

/**
 * Reglas de servidor del dominio Activos. Única representación de cada regla:
 * las aplican tanto el módulo nuevo como los servicios que ya consume el BO
 * (`/supplies`, `/supply-types`, `/employee-supplies`, fotos).
 *
 * Los modelos llevan el mixin de empresa, así que toda consulta ya viaja
 * acotada al tenant de la request.
 */

type Client = { client?: TransactionClientContract }

const clientOf = (trx?: TransactionClientContract): Client => (trx ? { client: trx } : {})

/**
 * El folio es único por empresa entre activos no borrados (el UNIQUE de BD es
 * el candado final; esto da el 409 con key antes de llegar a él).
 *
 * @throws AssetError 409 `folio-de-activo-duplicado`.
 */
export async function assertFileNumberAvailable(
  businessUnitId: number | null,
  fileNumber: string,
  excludeSupplyId?: number
): Promise<void> {
  const query = Supplie.query().where('supplyFileNumber', fileNumber)
  if (businessUnitId !== null) query.where('businessUnitId', businessUnitId)
  if (excludeSupplyId !== undefined) query.whereNot('supplyId', excludeSupplyId)
  if (await query.first()) throw AssetError.fileNumberTaken()
}

/**
 * Un activo tiene a lo más un resguardo `active`. Con transacción, bloquea la
 * fila del activo (`FOR UPDATE`) para que dos altas simultáneas no pasen ambas.
 *
 * @throws AssetError 409 `activo-ya-tiene-resguardo-activo`.
 */
export async function assertNoOtherActiveAssignment(
  supplyId: number,
  excludeEmployeeSupplyId?: number,
  trx?: TransactionClientContract
): Promise<void> {
  if (trx) {
    await Supplie.query(clientOf(trx)).where('supplyId', supplyId).forUpdate().first()
  }
  const query = EmployeeSupplie.query(clientOf(trx))
    .where('supplyId', supplyId)
    .where('employeeSupplyStatus', 'active')
  if (excludeEmployeeSupplyId !== undefined) {
    query.whereNot('employeeSupplyId', excludeEmployeeSupplyId)
  }
  if (await query.first()) throw AssetError.activeAssignmentExists()
}

/**
 * No se borra un activo en resguardo.
 *
 * @throws AssetError 409 `activo-con-resguardo-activo`.
 */
export async function assertAssetWithoutActiveAssignment(supplyId: number): Promise<void> {
  const active = await EmployeeSupplie.query()
    .where('supplyId', supplyId)
    .where('employeeSupplyStatus', 'active')
    .first()
  if (active) throw AssetError.assetHasActiveAssignment()
}

/**
 * No se borra un tipo con activos no borrados.
 *
 * @throws AssetError 409 `tipo-de-activo-con-activos`.
 */
export async function assertSupplyTypeWithoutAssets(supplyTypeId: number): Promise<void> {
  const supply = await Supplie.query().where('supplyTypeId', supplyTypeId).first()
  if (supply) throw AssetError.typeHasAssets()
}

/**
 * Tope de fotos de asignación por resguardo, contando las que ya tiene.
 *
 * @throws AssetError 422 `limite-de-fotos-excedido`.
 */
export async function assertAssignationPhotoCapacity(
  employeeSupplyId: number,
  incoming: number
): Promise<void> {
  const row = await EmployeeSupplieAssignationPhoto.query()
    .where('employeeSupplyId', employeeSupplyId)
    .where('employeeSupplieAssignationPhotoType', 'assignation')
    .count('* as total')
    .first()
  const current = Number(row?.$extras.total ?? 0)
  if (current + incoming > MAX_ASSIGNATION_PHOTOS_PER_ASSIGNMENT) {
    throw AssetError.photoLimitExceeded()
  }
}

/**
 * Cierra los resguardos activos del activo (los pasa a `retired`) con el motivo
 * y la fecha de la baja. Devuelve los resguardos cerrados.
 */
export async function closeActiveAssignments(
  supplyId: number,
  reason: string,
  date: DateTime,
  trx: TransactionClientContract
): Promise<EmployeeSupplie[]> {
  const active = await EmployeeSupplie.query(clientOf(trx))
    .where('supplyId', supplyId)
    .where('employeeSupplyStatus', 'active')
  for (const assignment of active) {
    assignment.useTransaction(trx)
    assignment.employeeSupplyStatus = 'retired'
    assignment.employeeSupplyRetirementReason = reason
    assignment.employeeSupplyRetirementDate = date
    await assignment.save()
  }
  return active
}
