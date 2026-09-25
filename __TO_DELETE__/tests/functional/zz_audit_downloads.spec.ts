import { test } from '@japa/runner'
import fs from 'node:fs'
import path from 'node:path'
import { DateTime } from 'luxon'
import User from '#models/user'
import SeparationLetterPdfService from '#modules/employee-offboarding/documents/separation_letter_pdf.service'

/**
 * ARNES TEMPORAL DE AUDITORIA (no es parte de la suite). Genera cada
 * descargable con datos reales de la BD de desarrollo y lo guarda en disco
 * para revisarlo fuera de proceso. Se corre con DB_DATABASE=valanserh.
 */
const OUT = '/private/tmp/claude-501/-Users-wilvardo-Documents-Organizaci-n/ada25c10-37ed-4788-864d-1bba7bc42d34/scratchpad/audit/files'
const BU_PUBLIC_ID = 'b6cc82c8-1437-4f77-b1af-df4f810f3aef'
const OWNER_USER_ID = 7

type Method = 'get' | 'post'
interface Case {
  name: string
  method: Method
  url: string
  qs?: Record<string, string | number>
  json?: Record<string, unknown>
  userId?: number
}

const EMP = 413
const EMP2 = 372
const DEPT = 1038
const POS = 1014
const D1 = '2026-08-01'
const D2 = '2026-08-15'

const cases: Case[] = [
  { name: 'supplies-excel', method: 'get', url: '/api/supplies/excel' },
  { name: 'assist-employee-assistance', method: 'get', url: '/api/v1/assists/get-excel-by-employee', qs: { employeeId: EMP, date: D1, 'date-end': D2, reportType: 'Assistance Report' } },
  { name: 'assist-employee-incident', method: 'get', url: '/api/v1/assists/get-excel-by-employee', qs: { employeeId: EMP, date: D1, 'date-end': D2, reportType: 'Incident Summary' } },
  { name: 'assist-employee-incident-payroll', method: 'get', url: '/api/v1/assists/get-excel-by-employee', qs: { employeeId: EMP, date: D1, 'date-end': D2, datePay: '2026-08-06', reportType: 'Incident Summary Payroll' } },
  { name: 'assist-position', method: 'get', url: '/api/v1/assists/get-excel-by-position', qs: { departmentId: DEPT, positionId: POS, date: D1, 'date-end': D2 } },
  { name: 'assist-department-assistance', method: 'get', url: '/api/v1/assists/get-excel-by-department', qs: { departmentId: DEPT, date: D1, 'date-end': D2, reportType: 'Assistance Report' } },
  { name: 'assist-department-incident', method: 'get', url: '/api/v1/assists/get-excel-by-department', qs: { departmentId: DEPT, date: D1, 'date-end': D2, reportType: 'Incident Summary' } },
  { name: 'assist-department-incident-payroll', method: 'get', url: '/api/v1/assists/get-excel-by-department', qs: { departmentId: DEPT, date: D1, 'date-end': D2, datePay: '2026-08-06', reportType: 'Incident Summary Payroll' } },
  { name: 'assist-all-assistance', method: 'get', url: '/api/v1/assists/get-excel-all', qs: { date: D1, 'date-end': '2026-08-07', reportType: 'Assistance Report' } },
  { name: 'assist-all-incident', method: 'get', url: '/api/v1/assists/get-excel-all', qs: { date: D1, 'date-end': '2026-08-07', reportType: 'Incident Summary' } },
  { name: 'assist-all-incident-payroll', method: 'get', url: '/api/v1/assists/get-excel-all', qs: { date: D1, 'date-end': '2026-08-07', datePay: '2026-08-06', reportType: 'Incident Summary Payroll' } },
  { name: 'assist-permissions-dates', method: 'get', url: '/api/v1/assists/get-excel-permissions-dates', qs: { date: '2026-01-01', 'date-end': '2026-08-31' } },
  { name: 'assist-format-payroll', method: 'get', url: '/api/v1/assists/get-format-payroll', qs: { date: '2026-08-06' } },
  { name: 'employees-excel', method: 'get', url: '/api/employees/employee-generate-excel', qs: { motive: 'auditoria-interna' } },
  { name: 'employees-template', method: 'get', url: '/api/employees/template-excel' },
  { name: 'employees-template-filled', method: 'get', url: '/api/employees/template-excel', qs: { fillWithExisting: 'true', motive: 'auditoria-interna' } },
  { name: 'employees-shift-exceptions', method: 'get', url: `/api/employees/${EMP}/export-excel` },
  { name: 'employees-shift-assignment-template', method: 'get', url: '/api/employees/shift-assignment-template', qs: { startDate: D1, endDate: D2, employeeIds: `${EMP},${EMP2}` } },
  { name: 'employees-shift-assignment-template-report', method: 'get', url: '/api/employees/shift-assignment-template', qs: { startDate: D1, endDate: D2, isReport: 'true' } },
  { name: 'employees-attendance-report', method: 'get', url: '/api/employees/attendance-report', qs: { startDate: D1, endDate: D2 } },
  { name: 'employees-birthdays', method: 'get', url: '/api/employees/get-birthday-excel', qs: { year: 2026 } },
  { name: 'employees-anniversaries', method: 'get', url: '/api/employees/get-anniversary-excel', qs: { year: 2026 } },
  { name: 'holidays-excel', method: 'get', url: '/api/holidays/export-excel', qs: { year: 2026 } },
  { name: 'vacations-excel', method: 'get', url: '/api/employees-vacations/get-excel', qs: { startDate: '2026-01-01', endDate: '2026-12-31' } },
  { name: 'vacations-used-excel', method: 'get', url: '/api/employees-vacations/get-vacations-used-excel', qs: { startDate: '2026-01-01', endDate: '2026-12-31' } },
  { name: 'vacations-summary-excel', method: 'get', url: '/api/employees-vacations/get-vacations-summary-excel', qs: { startDate: '2026-01-01', endDate: '2026-12-31' } },
  { name: 'vacations-import-template', method: 'get', url: '/api/employees-vacations/get-vacation-import-template' },
  { name: 'position-pdf', method: 'get', url: `/api/positions/get-pdf/${POS}` },
  { name: 'position-excel', method: 'get', url: `/api/positions/get-excel/${POS}` },
  { name: 'contratos-plantilla', method: 'get', url: '/api/contratos-servicios-especializados/plantilla-importacion' },
  { name: 'repse-coverage', method: 'get', url: '/api/repse/coverage-report/export', qs: { from: D1, to: D2 } },
  { name: 'consent-evidence', method: 'get', url: '/api/consent/evidence/export', userId: 1 },
  { name: 'complaints-xlsx', method: 'get', url: '/api/v1/complaints/report/export', qs: { from: '2026-01-01', to: '2026-09-24', format: 'xlsx' } },
  { name: 'complaints-pdf', method: 'get', url: '/api/v1/complaints/report/export', qs: { from: '2026-01-01', to: '2026-09-24', format: 'pdf' } },
  { name: 'traumatic-registry-pdf', method: 'get', url: '/api/traumatic-event-reports/registry/export', qs: { from: '2026-01-01', to: '2026-09-24', motive: 'auditoria-interna' } },
  { name: 'lactation-compliance-pdf', method: 'get', url: '/api/employee-lactation-periods/compliance-report/export', qs: { page: 1, limit: 500, motive: 'auditoria-interna' } },
  { name: 'badge-pdf', method: 'get', url: `/api/employee-badges/${EMP}/pdf` },
  { name: 'badge-png', method: 'get', url: `/api/employee-badges/${EMP}/png` },
  { name: 'badge-bulk-pdf', method: 'post', url: '/api/employee-badges/bulk', json: { empleadoIds: [EMP, EMP2], formato: 'pdf' } },
  { name: 'badge-bulk-png', method: 'post', url: '/api/employee-badges/bulk', json: { empleadoIds: [EMP, EMP2], formato: 'png' } },
]

const reportJobs: Array<{ name: string; body: Record<string, unknown> }> = [
  { name: 'job-assistance-all', body: { reportType: 'assistance_all', date: D1, 'date-end': '2026-08-07' } },
  { name: 'job-assistance-employee', body: { reportType: 'assistance_employee', employeeId: EMP, date: D1, 'date-end': D2 } },
  { name: 'job-incident-summary', body: { reportType: 'assistance_incident_summary', date: D1, 'date-end': '2026-08-07' } },
  { name: 'job-incident-summary-employee', body: { reportType: 'assistance_incident_summary', employeeId: EMP, date: D1, 'date-end': D2 } },
  { name: 'job-incident-summary-payroll', body: { reportType: 'assistance_incident_summary_payroll', date: D1, 'date-end': '2026-08-07', datePay: '2026-08-06' } },
  { name: 'job-incident-summary-payroll-employee', body: { reportType: 'assistance_incident_summary_payroll', employeeId: EMP, date: D1, 'date-end': D2, datePay: '2026-08-06' } },
]

function binaryParser(res: any, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = []
  res.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
  res.on('end', () => cb(null, Buffer.concat(chunks)))
}

function save(name: string, status: number, headers: Record<string, unknown>, body: unknown, ms: number) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body ?? ''))
  fs.writeFileSync(path.join(OUT, `${name}.bin`), buf)
  fs.writeFileSync(
    path.join(OUT, `${name}.meta.json`),
    JSON.stringify({ name, status, ms, headers, size: buf.length, head: buf.subarray(0, 8).toString('latin1') }, null, 2)
  )
}

test.group('zz audit downloads', () => {
  for (const c of cases) {
    test(c.name, async ({ client }) => {
      const user = await User.findOrFail(c.userId ?? OWNER_USER_ID)
      const t0 = Date.now()
      let req = client[c.method](c.url).loginAs(user).headers({ 'X-Business-Unit-Id': BU_PUBLIC_ID, 'Accept-Language': 'es' })
      if (c.qs) req = req.qs(c.qs)
      if (c.json) req = req.json(c.json)
      req.request.buffer(true).parse(binaryParser as any)
      const res = await req
      save(c.name, res.status(), res.headers(), res.body(), Date.now() - t0)
    }).timeout(600_000)
  }

  for (const j of process.env.AUDIT_SKIP_JOBS ? [] : reportJobs) {
    test(j.name, async ({ client }) => {
      const user = await User.findOrFail(OWNER_USER_ID)
      const h = { 'X-Business-Unit-Id': BU_PUBLIC_ID, 'Accept-Language': 'es' }
      const t0 = Date.now()
      const created = await client.post('/api/v1/assists/reports').loginAs(user).headers(h).json(j.body)
      const id = created.body()?.data?.reportJobId
      if (!id) {
        save(j.name, created.status(), created.headers(), created.body(), Date.now() - t0)
        return
      }
      let status = 'pending'
      let last: unknown = null
      for (let i = 0; i < 600 && status !== 'completed' && status !== 'failed'; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        const s = await client.get(`/api/v1/assists/reports/${id}/status`).loginAs(user).headers(h)
        last = s.body()
        status = s.body()?.data?.status ?? s.body()?.data?.reportJobStatus ?? 'unknown'
        if (status === 'unknown') break
      }
      if (status !== 'completed') {
        save(j.name, 0, {}, { status, last }, Date.now() - t0)
        return
      }
      const req = client.get(`/api/v1/assists/reports/${id}/download`).loginAs(user).headers(h)
      req.request.buffer(true).parse(binaryParser as any)
      const res = await req
      save(j.name, res.status(), res.headers(), res.body(), Date.now() - t0)
    }).timeout(900_000)
  }

  test('offboarding-separation-letter-pdf (servicio directo)', async () => {
    const buf = await new SeparationLetterPdfService().render({
      folio: 'SEP-2026-0001',
      employeeName: 'Nombre Apellido Prueba Ñandú',
      positionName: 'Auxiliar de operaciones',
      departmentOrUnit: 'Operaciones',
      legalName: 'Servicios Aéreos Estrella SA de CV',
      hireDateIso: '2019-03-15',
      referenceDateIso: '2026-09-15',
      seniority: { years: 7, months: 6 },
      tradeName: 'Servicios Aéreos Estrella',
      issuedAt: DateTime.now(),
    })
    save('offboarding-separation-letter-pdf', 200, { 'content-type': '(servicio directo)' }, buf, 0)
  })
})
