/**
 * Contenido oficial c_RegimenFiscal y c_UsoCFDI (Anexo 20 CFDI 4.0).
 * Fuente: USRH1786737531063 — contrastado 2026-08-14.
 */

export interface SatTaxRegimeSeedRow {
  code: string
  description: string
  appliesToIndividual: boolean
  appliesToLegalEntity: boolean
}

export interface SatCfdiUseSeedRow {
  code: string
  description: string
  appliesToIndividual: boolean
  appliesToLegalEntity: boolean
  receiverRegimeCodes: readonly string[]
}

/** Regímenes admitidos por G01–G03 e I01–I08. */
export const SAT_CFDI_USE_REGIMES_GI_GROUP = [
  '601',
  '603',
  '606',
  '612',
  '620',
  '621',
  '622',
  '623',
  '624',
  '625',
  '626',
] as const

/** Regímenes admitidos por D01–D10. */
export const SAT_CFDI_USE_REGIMES_D_GROUP = [
  '605',
  '606',
  '607',
  '608',
  '611',
  '612',
  '614',
  '615',
  '625',
] as const

/** Las 19 claves vigentes de c_RegimenFiscal. */
export const SAT_ALL_TAX_REGIME_CODES = [
  '601',
  '603',
  '605',
  '606',
  '607',
  '608',
  '610',
  '611',
  '612',
  '614',
  '615',
  '616',
  '620',
  '621',
  '622',
  '623',
  '624',
  '625',
  '626',
] as const

export const SAT_TAX_REGIME_SEED_DATA: SatTaxRegimeSeedRow[] = [
  {
    code: '601',
    description: 'General de Ley Personas Morales',
    appliesToIndividual: false,
    appliesToLegalEntity: true,
  },
  {
    code: '603',
    description: 'Personas Morales con Fines no Lucrativos',
    appliesToIndividual: false,
    appliesToLegalEntity: true,
  },
  {
    code: '605',
    description: 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
    appliesToIndividual: true,
    appliesToLegalEntity: false,
  },
  {
    code: '606',
    description: 'Arrendamiento',
    appliesToIndividual: true,
    appliesToLegalEntity: false,
  },
  {
    code: '607',
    description: 'Régimen de Enajenación o Adquisición de Bienes',
    appliesToIndividual: true,
    appliesToLegalEntity: false,
  },
  {
    code: '608',
    description: 'Demás ingresos',
    appliesToIndividual: true,
    appliesToLegalEntity: false,
  },
  {
    code: '610',
    description: 'Residentes en el Extranjero sin Establecimiento Permanente en México',
    appliesToIndividual: true,
    appliesToLegalEntity: true,
  },
  {
    code: '611',
    description: 'Ingresos por Dividendos (socios y accionistas)',
    appliesToIndividual: true,
    appliesToLegalEntity: false,
  },
  {
    code: '612',
    description: 'Personas Físicas con Actividades Empresariales y Profesionales',
    appliesToIndividual: true,
    appliesToLegalEntity: false,
  },
  {
    code: '614',
    description: 'Ingresos por intereses',
    appliesToIndividual: true,
    appliesToLegalEntity: false,
  },
  {
    code: '615',
    description: 'Régimen de los ingresos por obtención de premios',
    appliesToIndividual: true,
    appliesToLegalEntity: false,
  },
  {
    code: '616',
    description: 'Sin obligaciones fiscales',
    appliesToIndividual: true,
    appliesToLegalEntity: true,
  },
  {
    code: '620',
    description: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos',
    appliesToIndividual: false,
    appliesToLegalEntity: true,
  },
  {
    code: '621',
    description: 'Incorporación Fiscal',
    appliesToIndividual: true,
    appliesToLegalEntity: false,
  },
  {
    code: '622',
    description: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
    appliesToIndividual: false,
    appliesToLegalEntity: true,
  },
  {
    code: '623',
    description: 'Opcional para Grupos de Sociedades',
    appliesToIndividual: false,
    appliesToLegalEntity: true,
  },
  {
    code: '624',
    description: 'Coordinados',
    appliesToIndividual: false,
    appliesToLegalEntity: true,
  },
  {
    code: '625',
    description:
      'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
    appliesToIndividual: true,
    appliesToLegalEntity: false,
  },
  {
    code: '626',
    description: 'Régimen Simplificado de Confianza',
    appliesToIndividual: true,
    appliesToLegalEntity: true,
  },
]

const giUses: Omit<SatCfdiUseSeedRow, 'code' | 'description'> = {
  appliesToIndividual: true,
  appliesToLegalEntity: true,
  receiverRegimeCodes: SAT_CFDI_USE_REGIMES_GI_GROUP,
}

const dUses: Omit<SatCfdiUseSeedRow, 'code' | 'description'> = {
  appliesToIndividual: true,
  appliesToLegalEntity: false,
  receiverRegimeCodes: SAT_CFDI_USE_REGIMES_D_GROUP,
}

export const SAT_CFDI_USE_SEED_DATA: SatCfdiUseSeedRow[] = [
  { code: 'G01', description: 'Adquisición de mercancías', ...giUses },
  { code: 'G02', description: 'Devoluciones, descuentos o bonificaciones', ...giUses },
  { code: 'G03', description: 'Gastos en general', ...giUses },
  { code: 'I01', description: 'Construcciones', ...giUses },
  { code: 'I02', description: 'Mobiliario y equipo de oficina por inversiones', ...giUses },
  { code: 'I03', description: 'Equipo de transporte', ...giUses },
  { code: 'I04', description: 'Equipo de cómputo y accesorios', ...giUses },
  { code: 'I05', description: 'Dados, troqueles, moldes, matrices y herramental', ...giUses },
  { code: 'I06', description: 'Comunicaciones telefónicas', ...giUses },
  { code: 'I07', description: 'Comunicaciones satelitales', ...giUses },
  { code: 'I08', description: 'Otra maquinaria y equipo', ...giUses },
  {
    code: 'D01',
    description: 'Honorarios médicos, dentales y gastos hospitalarios',
    ...dUses,
  },
  {
    code: 'D02',
    description: 'Gastos médicos por incapacidad o discapacidad',
    ...dUses,
  },
  { code: 'D03', description: 'Gastos funerales', ...dUses },
  { code: 'D04', description: 'Donativos', ...dUses },
  {
    code: 'D05',
    description:
      'Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)',
    ...dUses,
  },
  { code: 'D06', description: 'Aportaciones voluntarias al SAR', ...dUses },
  { code: 'D07', description: 'Primas por seguros de gastos médicos', ...dUses },
  { code: 'D08', description: 'Gastos de transportación escolar obligatoria', ...dUses },
  {
    code: 'D09',
    description:
      'Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones',
    ...dUses,
  },
  { code: 'D10', description: 'Pagos por servicios educativos (colegiaturas)', ...dUses },
  {
    code: 'S01',
    description: 'Sin efectos fiscales',
    appliesToIndividual: true,
    appliesToLegalEntity: true,
    receiverRegimeCodes: SAT_ALL_TAX_REGIME_CODES,
  },
  {
    code: 'CP01',
    description: 'Pagos',
    appliesToIndividual: true,
    appliesToLegalEntity: true,
    receiverRegimeCodes: SAT_ALL_TAX_REGIME_CODES,
  },
  {
    code: 'CN01',
    description: 'Nómina',
    appliesToIndividual: true,
    appliesToLegalEntity: false,
    receiverRegimeCodes: ['605'],
  },
]

/** Conteos de control del anexo (§3). */
export const SAT_CATALOG_EXPECTED_COUNTS = {
  taxRegimes: 19,
  cfdiUses: 24,
  pivotRows: 250,
} as const
