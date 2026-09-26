# Contrato API — Aplicabilidad de Cuestionarios NOM-035

## Objetivo

Determinar automáticamente el instrumento aplicable por sucursal con base en la cantidad de empleados activos:

- `none`: 15 o menos
- `guide_ii`: entre 16 y 50
- `guide_iii`: más de 50

## Reglas de negocio

1. El cálculo es derivado; no se persiste en una tabla nueva.
2. El conteo de activos considera:
   - asignación vigente en `employee_branch_offices` (`employee_branch_office_active = 1`)
   - empleado no eliminado lógicamente (`employees.employee_deleted_at IS NULL`)
3. La aplicabilidad se evalúa por sucursal.
4. El endpoint por empresa evalúa todas las sucursales de una unidad de negocio.
5. Los mensajes respetan `Accept-Language`.

## Endpoints

### 1) Listado por empresa

`GET /api/nom035/questionnaire-applicability?businessUnitId={id}`

#### Query params

- `businessUnitId` (number, requerido, > 0)

#### 200 — Ejemplo de respuesta

```json
{
  "type": "success",
  "title": "Questionnaire Applicabilities",
  "message": "Aplicabilidad por sucursal obtenida correctamente",
  "data": {
    "questionnaireApplicabilities": [
      {
        "branchOfficeId": 10,
        "branchOfficeName": "Sucursal Norte",
        "activeEmployees": 12,
        "applicableInstrument": "none",
        "note": "El centro de trabajo cuenta con 12 trabajadores activos. La NOM-035-STPS-2018 no exige la aplicación de cuestionarios para centros con 15 o menos trabajadores."
      },
      {
        "branchOfficeId": 11,
        "branchOfficeName": "Sucursal Centro",
        "activeEmployees": 35,
        "applicableInstrument": "guide_ii",
        "note": null
      },
      {
        "branchOfficeId": 12,
        "branchOfficeName": "Sucursal Sur",
        "activeEmployees": 78,
        "applicableInstrument": "guide_iii",
        "note": null
      }
    ]
  }
}
```

#### 400 — Parámetros inválidos

```json
{
  "type": "error",
  "title": "Error",
  "message": "The businessUnitId field must be a positive number",
  "data": null,
  "errorCode": "NOM035.APP.VAL_INPUT"
}
```

#### 404 — Empresa no encontrada/no disponible

```json
{
  "type": "error",
  "title": "Error",
  "message": "Empresa no encontrada o no disponible para esta instancia del sistema",
  "data": null,
  "errorCode": "NOM035.APP.NOT_FOUND_COMPANY"
}
```

### 2) Consulta por sucursal

`GET /api/nom035/questionnaire-applicability/{branchOfficeId}`

#### Path params

- `branchOfficeId` (number, requerido, > 0)

#### 200 — Ejemplo de respuesta

```json
{
  "type": "success",
  "title": "Questionnaire Applicability",
  "message": "Aplicabilidad de sucursal obtenida correctamente",
  "data": {
    "questionnaireApplicability": {
      "branchOfficeId": 11,
      "branchOfficeName": "Sucursal Centro",
      "activeEmployees": 35,
      "applicableInstrument": "guide_ii",
      "note": null
    }
  }
}
```

#### 400 — Parámetro inválido

```json
{
  "type": "error",
  "title": "Error",
  "message": "El parámetro branchOfficeId debe ser un número entero positivo",
  "data": null,
  "errorCode": "NOM035.APP.VAL_INPUT"
}
```

#### 404 — Sucursal no encontrada/no disponible

```json
{
  "type": "error",
  "title": "Error",
  "message": "Sucursal no encontrada o no disponible para esta instancia del sistema",
  "data": null,
  "errorCode": "NOM035.APP.NOT_FOUND_BRANCH"
}
```

## Errores transversales

### 401 — No autenticado

```json
{
  "message": "Unauthorized access"
}
```

### 403 — Sin permisos de módulo

```json
{
  "type": "error",
  "title": "Error",
  "message": "Sin permiso para consultar la aplicabilidad de cuestionarios",
  "data": null,
  "errorCode": "NOM035.APP.FORBIDDEN"
}
```

## Criterios de aceptación cubiertos

1. Sucursal con 16-50 activos regresa `guide_ii`.
2. Sucursal con más de 50 regresa `guide_iii`.
3. Sucursal con 15 o menos regresa `none` y nota de identificación.
4. Endpoint por empresa regresa aplicabilidad por sucursal con conteo.
