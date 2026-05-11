/**
 * Resolución uniforme del identificador de padre en payloads de departamento/puesto,
 * contemplando camelCase legacy y snake_case (`parent_id`).
 */
export function resolveDepartmentParentFromBody(body: Record<string, unknown>): unknown {
  if (Object.prototype.hasOwnProperty.call(body, 'parentDepartmentId')) {
    return body.parentDepartmentId
  }
  if (Object.prototype.hasOwnProperty.call(body, 'parent_id')) {
    return body.parent_id
  }
  return undefined
}

export function resolvePositionParentFromBody(body: Record<string, unknown>): unknown {
  if (Object.prototype.hasOwnProperty.call(body, 'parentPositionId')) {
    return body.parentPositionId
  }
  if (Object.prototype.hasOwnProperty.call(body, 'parent_id')) {
    return body.parent_id
  }
  return undefined
}
