import { test } from '@japa/runner'
import ExcelJS from 'exceljs'
import SupplieService from '#services/supplie_service'
test('dump', async () => {
  const r = await SupplieService.getExcelReport()
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.buffer as ArrayBuffer)
  wb.worksheets[0].eachRow((row, n) => { if (n <= 12) console.log(n, JSON.stringify((row.values as unknown[]).slice(1))) })
})
