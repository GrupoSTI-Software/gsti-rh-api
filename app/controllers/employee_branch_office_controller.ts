import type { HttpContext } from '@adonisjs/core/http'
import EmployeeBranchOfficeService from '#services/employee_branch_office_service'
import { assignEmployeeBranchOfficeValidator } from '#validators/employee_branch_office'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

export default class EmployeeBranchOfficeController {
  /**
   * POST /api/employees/:employeeId/branch-office
   * Body: { branchOfficeId }
   */
  async assign({ request, response, params, businessUnitScope }: HttpContext) {
    try {
      const { branchOfficeId } = await request.validateUsing(assignEmployeeBranchOfficeValidator)
      const row = await EmployeeBranchOfficeService.assign(Number(params.employeeId), branchOfficeId, businessUnitScope)
      return StandardResponseFormatter.success(
        response,
        row,
        'Employee Branch Office',
        'Sucursal asignada correctamente',
        201
      )
    } catch (error: any) {
      const msg =
        error.code === 'E_VALIDATION_ERROR'
          ? error.messages?.[0]?.message ?? error.message
          : error.message ?? 'Error al asignar sucursal'
      const status = error.code === 'E_VALIDATION_ERROR' ? 400 : error.code === 'E_ROW_NOT_FOUND' ? 404 : 400
      return StandardResponseFormatter.error(response, msg, status)
    }
  }

  /**
   * DELETE /api/employees/:employeeId/branch-office
   */
  async unassign({ response, params }: HttpContext) {
    try {
      await EmployeeBranchOfficeService.unassign(Number(params.employeeId))
      return StandardResponseFormatter.success(
        response,
        null,
        'Employee Branch Office',
        'Sucursal desasignada correctamente'
      )
    } catch (error: any) {
      const status = error.code === 'E_ROW_NOT_FOUND' ? 404 : 400
      return StandardResponseFormatter.error(response, error.message ?? 'Error al desasignar sucursal', status)
    }
  }

  /**
   * GET /api/employees/:employeeId/branch-offices/history
   */
  async history({ response, params }: HttpContext) {
    try {
      const rows = await EmployeeBranchOfficeService.getHistory(Number(params.employeeId))
      return StandardResponseFormatter.success(
        response,
        rows,
        'Employee Branch Offices',
        'Historial de sucursales obtenido correctamente'
      )
    } catch (error: any) {
      const status = error.code === 'E_ROW_NOT_FOUND' ? 404 : 400
      return StandardResponseFormatter.error(
        response,
        error.message ?? 'Error al obtener historial de sucursales',
        status
      )
    }
  }
}
