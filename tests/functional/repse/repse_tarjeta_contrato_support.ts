import db from '@adonisjs/lucid/services/db'
import type BusinessUnit from '#models/business_unit'
import { todayInBusinessZone, toBusinessDateString } from '#utils/business_date'
import {
  cleanupRepseContratoArtifacts,
  cleanupRepseSensitiveMaskFixture,
  createRepseSensitiveMaskFixture,
  type RepseSensitiveMaskFixture,
} from './repse_contratos_asignaciones_sensitive_mask_support.js'
import { createContratoInTenant, uniqueStamp } from '../helpers/contrato_import_excel_fixture.js'

/**
 * Escenario de datos de tarjeta de contratos REPSE, relativo a HOY en zona de
 * negocio para que no caduque con el calendario:
 *
 * - `porVencerId`: vigente, `fechaFin` = hoy + 10, documento firmado vigente,
 *   1 trabajador asignado vigente (más una asignación borrada que no cuenta)
 *   y 5 declarados en el anexo 15-D.
 * - `vigenteLejanoId`: vigente, `fechaFin` = hoy + 200, sin documento ni asignaciones.
 * - `borradorId`: borrador (no entra en pendientes ni cuenta como vigente).
 */
export interface TarjetaContratoFixture {
  base: RepseSensitiveMaskFixture
  porVencerId: number
  vigenteLejanoId: number
  borradorId: number
  diasPorVencer: number
}

const DIAS_POR_VENCER = 10
const DIAS_VIGENTE_LEJANO = 200

function isoDesdeHoy(dias: number): string {
  return toBusinessDateString(todayInBusinessZone().plus({ days: dias }))
}

async function setVigente(contratoId: number, fechaFinIso: string): Promise<void> {
  await db
    .from('contratos_servicios_especializados')
    .where('contrato_servicio_especializado_id', contratoId)
    .update({
      contrato_servicio_especializado_estatus: 'vigente',
      contrato_servicio_especializado_fecha_inicio: isoDesdeHoy(-30),
      contrato_servicio_especializado_fecha_fin: fechaFinIso,
    })
}

export async function createTarjetaContratoFixture(
  businessUnit: BusinessUnit,
  prefix: string
): Promise<TarjetaContratoFixture> {
  const base = await createRepseSensitiveMaskFixture(businessUnit, prefix)
  const businessUnitId = businessUnit.businessUnitId

  const porVencerId = base.contratoId
  await setVigente(porVencerId, isoDesdeHoy(DIAS_POR_VENCER))

  await db.table('asignaciones_contrato_especializado').insert([
    {
      contrato_servicio_especializado_id: porVencerId,
      employee_id: base.employeeConNss.employee.employeeId,
      business_unit_id: businessUnitId,
      asignacion_contrato_especializado_fecha_inicio: isoDesdeHoy(-5),
      asignacion_contrato_especializado_fecha_fin: null,
    },
    {
      contrato_servicio_especializado_id: porVencerId,
      employee_id: base.employeeSinNss.employee.employeeId,
      business_unit_id: businessUnitId,
      asignacion_contrato_especializado_fecha_inicio: isoDesdeHoy(-5),
      asignacion_contrato_especializado_fecha_fin: null,
      asignacion_contrato_especializado_deleted_at: new Date(),
    },
  ])

  await db.table('documentos_contrato_especializado').insert({
    contrato_servicio_especializado_id: porVencerId,
    business_unit_id: businessUnitId,
    documento_contrato_especializado_origen: 'subido',
    documento_contrato_especializado_vigente: true,
    documento_contrato_especializado_fecha_inicio_vigencia: isoDesdeHoy(-30),
    documento_contrato_especializado_fecha_vencimiento: isoDesdeHoy(300),
    documento_contrato_especializado_nombre_archivo: 'contrato-firmado.pdf',
    documento_contrato_especializado_storage_key: `tests/contrato-${uniqueStamp()}.pdf`,
    documento_contrato_especializado_mime_type: 'application/pdf',
    documento_contrato_especializado_tamano_bytes: 1024,
  })

  const vigenteLejanoId = await createContratoInTenant({
    fixture: base,
    numeroContrato: `CSE-TARJETA-LEJANO-${uniqueStamp()}`,
  })
  await setVigente(vigenteLejanoId, isoDesdeHoy(DIAS_VIGENTE_LEJANO))

  const borradorId = await createContratoInTenant({
    fixture: base,
    numeroContrato: `CSE-TARJETA-BORRADOR-${uniqueStamp()}`,
  })

  return { base, porVencerId, vigenteLejanoId, borradorId, diasPorVencer: DIAS_POR_VENCER }
}

export async function cleanupTarjetaContratoFixture(
  fixture: TarjetaContratoFixture | null
): Promise<void> {
  if (!fixture) return
  await db
    .from('documentos_contrato_especializado')
    .where('business_unit_id', fixture.base.businessUnit.businessUnitId)
    .delete()
  await cleanupRepseContratoArtifacts(fixture.vigenteLejanoId)
  await cleanupRepseContratoArtifacts(fixture.borradorId)
  await cleanupRepseSensitiveMaskFixture(fixture.base)
}
