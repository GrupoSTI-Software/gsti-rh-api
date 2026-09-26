import type { PermissionGateOptions } from '#constants/permission_gate'
import type { PositionActionSlug } from '#constants/positions_permission_catalog'

const positionsStandard = (action: PositionActionSlug): PermissionGateOptions => ({
  module: 'positions',
  action,
  bypass: 'standard',
})

export const POSITIONS_READ_PERMISSION_DECLARATIONS = {
  indexSalaryRanges: positionsStandard('salary-ranges-read'),
  currentSalaryRange: positionsStandard('salary-ranges-read'),
  historySalaryRanges: positionsStandard('salary-ranges-read'),
} as const satisfies Record<string, PermissionGateOptions>

export const POSITIONS_WRITE_PERMISSION_DECLARATIONS = {
  storeSalaryRange: positionsStandard('salary-ranges-write'),
  updateSalaryRange: positionsStandard('salary-ranges-write'),
} as const satisfies Record<string, PermissionGateOptions>

export const POSITIONS_DELETE_PERMISSION_DECLARATIONS = {
  closeSalaryRange: positionsStandard('salary-ranges-delete'),
} as const satisfies Record<string, PermissionGateOptions>

export const POSITIONS_AUDIT_READ_PERMISSION_DECLARATIONS = {
  auditSalaryRange: positionsStandard('salary-ranges-audit-read'),
} as const satisfies Record<string, PermissionGateOptions>
