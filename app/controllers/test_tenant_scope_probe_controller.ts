import Employee from '#models/employee'
import { HttpRequestMarker } from '#utils/http_request_marker'

/**
 * Endpoints de sondeo solo en `NODE_ENV=test` (USRH1789600808831 — N9/N14).
 * No montan `businessScope*`: validan vacío en HTTP y el marcador de petición.
 */
export default class TestTenantScopeProbeController {
  async listEmployeesWithoutBusinessScope() {
    const rows = await Employee.query().limit(50)
    return {
      data: rows.map((row) => ({ employeeId: row.employeeId })),
    }
  }

  async httpRequestMarkerFlag() {
    return { inHttpRequest: HttpRequestMarker.isInHttpRequest() }
  }
}
