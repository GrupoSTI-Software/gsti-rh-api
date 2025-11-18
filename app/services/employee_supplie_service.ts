import EmployeeSupplie from '#models/employee_supplie'
import Supplie from '#models/supplie'
import { EmployeeSupplieFilterSearchInterface } from '../interfaces/employee_supplie_filter_search_interface.js'
import { DateTime } from 'luxon'

export default class EmployeeSupplieService {
  /**
   * Get all employee supplies with pagination and filters
   */
  static async getAll(filters: EmployeeSupplieFilterSearchInterface) {
    const page = filters.page || 1
    const limit = filters.limit || 10
    const supplyTypeId = filters.supplyTypeId || null

    const query = EmployeeSupplie.query()

    if (filters.employeeId) {
      query.where('employeeId', filters.employeeId)
    }

    if (supplyTypeId) {
      query.whereHas('supply', (supplyQuery) => {
        supplyQuery.where('supplyTypeId', supplyTypeId)
      })
    }

    if (filters.supplyId) {
      query.where('supplyId', filters.supplyId)
    }

    if (filters.employeeSupplyStatus) {
      query.where('employeeSupplyStatus', filters.employeeSupplyStatus)
    }

    if (filters.supplyTypeId) {
      query.whereHas('supply', (supplyQuery) => {
        supplyQuery.where('supplyTypeId', filters.supplyTypeId as number)
      })
    }

    return await query.paginate(page, limit)
  }

  /**
   * Get employee supply by ID
   */
  static async getById(id: number) {
    return await EmployeeSupplie.findOrFail(id)
  }

  /**
   * Create new employee supply assignment
   */
  static async create(data: {
    employeeId: number
    supplyId: number
    employeeSupplyStatus?: 'active' | 'retired' | 'shipping'
  }) {
    // Get supply to check its type
    const supply = await Supplie.findOrFail(data.supplyId)

    // Check if employee already has an active or shipping supply of the same type
    const existingAssignment = await EmployeeSupplie.query()
      .where('employeeId', data.employeeId)
      .whereIn('employeeSupplyStatus', ['active', 'shipping'])
      .whereHas('supply', (supplyQuery) => {
        supplyQuery.where('supplyTypeId', supply.supplyTypeId)
      })
      .first()

    if (existingAssignment) {
      throw new Error('Employee already has an active or shipping supply of this type')
    }

    // Check if supply is available (active status)
    if (supply.supplyStatus !== 'active') {
      throw new Error('Supply is not available for assignment')
    }

    return await EmployeeSupplie.create({
      ...data,
      employeeSupplyStatus: data.employeeSupplyStatus || 'active'
    })
  }

  /**
   * Update employee supply
   */
  static async update(id: number, data: {
    employeeId?: number
    supplyId?: number
    employeeSupplyStatus?: 'active' | 'retired' | 'shipping'
  }) {
    const employeeSupply = await EmployeeSupplie.findOrFail(id)

    // If changing supply, check for conflicts
    if (data.supplyId && data.supplyId !== employeeSupply.supplyId) {
      const supply = await Supplie.findOrFail(data.supplyId)

      // Check if employee already has an active or shipping supply of the same type
      const existingAssignment = await EmployeeSupplie.query()
        .where('employeeId', employeeSupply.employeeId)
        .where('employeeSupplyId', '!=', id)
        .whereIn('employeeSupplyStatus', ['active', 'shipping'])
        .whereHas('supply', (supplyQuery) => {
          supplyQuery.where('supplyTypeId', supply.supplyTypeId)
        })
        .first()

      if (existingAssignment) {
        throw new Error('Employee already has an active or shipping supply of this type')
      }

      // Check if new supply is available
      if (supply.supplyStatus !== 'active') {
        throw new Error('Supply is not available for assignment')
      }
    }

    employeeSupply.merge(data)
    await employeeSupply.save()

    return employeeSupply
  }

  /**
   * Delete employee supply (soft delete)
   */
  static async delete(id: number) {
    const employeeSupply = await EmployeeSupplie.findOrFail(id)
    await employeeSupply.delete()
    return employeeSupply
  }

  /**
   * Retire employee supply with reason
   */
  static async retire(id: number, data: {
    employeeSupplyRetirementReason: string
    employeeSupplyRetirementDate?: string
  }) {
    const employeeSupply = await EmployeeSupplie.findOrFail(id)

    employeeSupply.employeeSupplyStatus = 'retired'
    employeeSupply.employeeSupplyRetirementReason = data.employeeSupplyRetirementReason
    employeeSupply.employeeSupplyRetirementDate = data.employeeSupplyRetirementDate
      ? DateTime.fromISO(data.employeeSupplyRetirementDate)
      : DateTime.now()

    await employeeSupply.save()
    return employeeSupply
  }

  /**
   * Get employee supply with relations
   */
  static async getWithRelations(id: number) {
    return await EmployeeSupplie.query()
      .where('employeeSupplyId', id)
      .preload('employee')
      .preload('supply', (supplyQuery) => {
        supplyQuery.preload('supplyType')
      })
      .firstOrFail()
  }

  /**
   * Get employee supplies by employee
   */
  static async getByEmployee(employeeId: number) {
    return await EmployeeSupplie.query()
      .where('employeeId', employeeId)
      .preload('supply', (supplyQuery) => {
        supplyQuery.preload('supplyType')
      })
  }

  /**
   * Get active employee supplies by employee
   */
  static async getActiveByEmployee(employeeId: number) {
    return await EmployeeSupplie.query()
      .where('employeeId', employeeId)
      .whereIn('employeeSupplyStatus', ['active', 'shipping'])
      .preload('supply', (supplyQuery) => {
        supplyQuery.preload('supplyType')
      })
  }
}
