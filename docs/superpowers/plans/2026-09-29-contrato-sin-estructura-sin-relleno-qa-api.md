# Prueba manual API — Contrato sin estructura, sin relleno

**Problema:** guardar un contrato de un colaborador obligaba a escribir un departamento y un puesto, aunque el colaborador todavía no los tuviera. Y donde el sistema completaba solo esos datos (al copiar el contrato al colaborador, al importar un Excel) inventaba un departamento o puesto de relleno —o copiaba uno ya dado de baja o de otra empresa— en lugar de dejar el espacio vacío.

**Solución:** ahora el contrato se puede guardar sin departamento y sin puesto: quedan **sin asignar**, sin inventar nada. El colaborador solo toma del contrato más reciente el departamento y el puesto que ese contrato trae, siguen vigentes y son de la empresa del propio colaborador; si no, conserva los suyos sin avisar. Un departamento o puesto mal escrito, inexistente o de otra empresa se rechaza con el mismo mensaje de siempre, y el valor `0` se rechaza con un aviso claro de datos no válidos. La importación de colaboradores desde Excel también deja **sin asignar** un departamento o puesto vacío o que no coincide, y al reimportar a un colaborador existente con esas celdas vacías conserva lo que ya tenía.

Ejemplo: es como la lista de una escuela donde antes, si a un alumno todavía no le tocaba salón, la secretaria le anotaba «salón cualquiera» para no dejar el espacio en blanco. Ahora el espacio puede quedar en blanco; y si el alumno ya tenía salón, no se lo cambian por uno de otra escuela ni por uno que ya cerró.

## Glosario

- **`Estructura`**: el departamento y el puesto de una persona en su empresa.
- **`Sin asignar`**: el colaborador o el contrato no tiene departamento o puesto; se ve como `null` en las respuestas y `NULL` en la base.
- **`Contrato más reciente`**: entre los contratos vigentes de un colaborador, el de fecha de inicio más nueva.
- **`Empresa`**: cada organización dentro del sistema; cada una tiene sus propios departamentos y puestos.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

**Header obligatorio en toda petición de este manual.** Además del token, cada endpoint exige el header `X-Business-Unit-Id` con el identificador público de la empresa de prueba (se resuelve en Preparar). Sin ese header el sistema responde error antes de llegar al caso que se prueba.

**Requisito previo:** la base con todas las migraciones aplicadas (sin ellas, guardar un contrato sin estructura falla).

**Sin interruptores globales:** este recorrido no enciende ninguna bandera compartida, así que no hay paso de limpieza. Para repetir el recorrido, vuelve a correr el seeder: deja de nuevo a los colaboradores y sus contratos sembrados como al inicio (los contratos que creaste en el recorrido se borran).

## 1. Preparar

Ejecutar el seeder compartido:

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja dos empresas —`QA Contrato Prueba` (la que actúa) y `QA Contrato Ajena` (solo aporta estructura ajena)—, su estructura, ocho colaboradores de la empresa de prueba y un usuario.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-contrato-principal@gsti-tests.local` | `password` | Usuario principal (`root`) de la empresa de prueba: crea, edita y borra contratos e importa colaboradores |

Una sola variante: esta historia no cambia quién puede guardar contratos ni importar, solo qué pasa con la estructura; los permisos no son parte de lo que se valida aquí.

| Código de nómina | Se usa en | Estructura al empezar | Contratos sembrados |
|---|---|---|---|
| `QA-CON-01` | Escenario 1 | `QA-CON-DA1` / `QA-CON-PA1` | ninguno |
| `QA-CON-02` | Escenario 2 | `QA-CON-DA1` / `QA-CON-PA1` | ninguno |
| `QA-CON-03` | Escenario 3 | `QA-CON-DA1` / `QA-CON-PA1` | ninguno |
| `QA-CON-04` | Escenario 4 | `QA-CON-DA1` / `QA-CON-PA1` | `QA-CON-04-ANTIGUO` (inicio 2020-01-01, con un departamento ya dado de baja, sin puesto) |
| `QA-CON-05` | Escenario 5 | `QA-CON-DA1` / `QA-CON-PA1` | `QA-CON-05-LEGADO` (inicio 2020-01-01, con el departamento y el puesto de la empresa ajena) |
| `QA-CON-06` | Escenario 6 | `QA-CON-DA1` / `QA-CON-PA1` | ninguno |
| `QA-CON-07` | Escenario 7 | `QA-CON-DA1` / `QA-CON-PA1` | `QA-CON-07-BASE` (inicio 2024-01-01, con `QA-CON-DA2` / `QA-CON-PA2`) |
| `QA-CON-10` | Escenario 10 | `QA-CON-DA1` / `QA-CON-PA1` | ninguno |

Estructura de la empresa de prueba: departamentos `QA-CON-DA1`, `QA-CON-DA2`, `QA-CON-DBAJA` (dado de baja) y un departamento **real** llamado exactamente `Sin departamento` (código `QA-CON-DSIN`); puestos `QA-CON-PA1` y `QA-CON-PA2`. Estructura de la empresa ajena: departamento `QA-CON-DB1` y puesto `QA-CON-PB1`.

Los identificadores que van en las peticiones no se inventan ni se hardcodean: resuélvelos con estas consultas.

El identificador público de la empresa de prueba, para el header `X-Business-Unit-Id` de todos los escenarios, y su identificador interno (un número, distinto del público), para el campo `payrollBusinessUnitId` de cada contrato:

```sql
SELECT business_unit_public_id, business_unit_id FROM business_units WHERE business_unit_slug = 'qa-contrato-prueba';
```

El identificador del tipo de contrato, para el campo `employeeContractTypeId`:

```sql
SELECT employee_contract_type_id FROM employee_contract_types WHERE employee_contract_type_slug = 'qa-contrato-tipo';
```

El identificador de cada colaborador (para `employeeId` y para el Escenario 10; se escribe `<id de QA-CON-01>`, `<id de QA-CON-02>`, etc.):

```sql
SELECT employee_payroll_code, employee_id FROM employees WHERE employee_payroll_code REGEXP '^QA-CON-[0-9]+$' AND employee_deleted_at IS NULL ORDER BY employee_payroll_code;
```

El identificador de los departamentos y puestos que van en los cuerpos (`<id de QA-CON-DA2>`, `<id de QA-CON-DB1>`, `<id de QA-CON-PA2>`, `<id de QA-CON-PB1>`):

```sql
SELECT department_code, department_id FROM departments WHERE department_code IN ('QA-CON-DA2', 'QA-CON-DB1') ORDER BY department_code;
SELECT position_code, position_id FROM positions WHERE position_code IN ('QA-CON-PA2', 'QA-CON-PB1') ORDER BY position_code;
```

Comprobación de partida — los ocho colaboradores empiezan en la misma estructura:

```sql
SELECT e.employee_payroll_code, d.department_code, p.position_code FROM employees e LEFT JOIN departments d ON d.department_id = e.department_id LEFT JOIN positions p ON p.position_id = e.position_id WHERE e.employee_payroll_code REGEXP '^QA-CON-[0-9]+$' ORDER BY e.employee_payroll_code;
```

Resultado: 8 filas (`QA-CON-01` … `QA-CON-07` y `QA-CON-10`), todas con `QA-CON-DA1` y `QA-CON-PA1`.

**Cuerpo de un contrato (escenarios 1 a 7).** Todos los escenarios de contrato usan el mismo cuerpo base; cada uno indica solo lo que cambia (folio, colaborador, departamento y puesto). Se envía como JSON:

- `employeeContractFolio`: el nombre único del contrato (no puede repetirse entre contratos vigentes).
- `employeeContractStartDate`: fecha de inicio; decide cuál es el contrato más reciente de un colaborador.
- `employeeContractStatus`: `active`.
- `employeeContractMonthlyNetSalary`: sueldo mensual neto.
- `employeeContractTypeId`: el tipo de contrato resuelto arriba.
- `employeeId`: el colaborador del escenario.
- `payrollBusinessUnitId`: el identificador interno de la empresa de prueba resuelto arriba.
- `employeeContractActive`: `1` (sí, el contrato está vigente).

Al editar (`PUT`) el cuerpo también va completo: el sistema no completa solo lo que falte (fecha de inicio, folio, sueldo).

## 2. Escenarios

### Escenario 1 — Contrato sin departamento ni puesto: se guarda sin asignar y el colaborador no cambia

Objetivo: comprobar que ya se puede registrar un contrato sin departamento ni puesto, que queda sin asignar y que el colaborador conserva el departamento y el puesto que ya tenía.

Usuario: **A**. Colaborador: `QA-CON-01`.

**Endpoint:** `POST /api/employee-contracts`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de la empresa de prueba, resuelto en Preparar>`

```json
{
  "employeeContractFolio": "QA-CON-01-ALTA",
  "employeeContractStartDate": "2024-01-01",
  "employeeContractStatus": "active",
  "employeeContractMonthlyNetSalary": 10000,
  "employeeContractTypeId": <id del tipo de contrato, resuelto en Preparar>,
  "employeeId": <id de QA-CON-01>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeContractActive": 1
}
```

(El cuerpo no trae `departmentId` ni `positionId`.)

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Employee contracts",
  "message": "The employee contract was created successfully",
  "data": {
    "employeeContract": {
      "employeeContractId": <id nuevo>,
      "employeeContractFolio": "QA-CON-01-ALTA",
      "employeeId": <id de QA-CON-01>,
      "departmentId": null,
      "positionId": null,
      "...": "..."
    }
  }
}
```

Confirmación de las consecuencias (una por una):

1. El contrato quedó sin asignar en la base. Consulta SQL:
   `SELECT d.department_code, p.position_code FROM employee_contracts c LEFT JOIN departments d ON d.department_id = c.department_id LEFT JOIN positions p ON p.position_id = c.position_id WHERE c.employee_contract_folio = 'QA-CON-01-ALTA';`
   Resultado: 1 fila con `NULL` y `NULL`.

2. El colaborador no cambió. Consulta SQL:
   `SELECT d.department_code, p.position_code FROM employees e LEFT JOIN departments d ON d.department_id = e.department_id LEFT JOIN positions p ON p.position_id = e.position_id WHERE e.employee_payroll_code = 'QA-CON-01';`
   Resultado: 1 fila con `QA-CON-DA1` y `QA-CON-PA1`.

Qué significa cada dato:

- `type`: cómo resultó la operación. Puede valer `success` (se guardó — el que se prueba aquí), `warning` (no se guardó porque un dato no cuadra; el mensaje explica cuál — se prueba desde el Escenario 5) o `error` (falla inesperada del servidor; no se puede provocar en este ambiente).
- `title` / `message`: el encabezado y la frase de la respuesta.
- `data.employeeContract`: el contrato tal como quedó guardado.
- `employeeContractId`: el identificador único del contrato; lo necesitan el `PUT` y el `DELETE` de los escenarios siguientes.
- `employeeContractFolio`: el nombre único que se le puso al contrato.
- `employeeId`: el colaborador dueño del contrato.
- `departmentId` / `positionId`: el departamento y el puesto del contrato. `null` quiere decir sin asignar: no se le inventa ninguno solo por guardarlo sin ellos.

### Escenario 2 — Editar con `null` limpia el contrato, no al colaborador

Objetivo: comprobar que dejar en blanco el departamento y el puesto de un contrato ya guardado los borra del contrato, pero no le quita al colaborador los que ya tenía; y que un contrato con departamento y puesto válidos sí se los pasa al colaborador (el contraste que hace visible lo anterior).

Usuario: **A**. Colaborador: `QA-CON-02`.

**Paso 1 — Alta con departamento y puesto de la empresa de prueba.**

**Endpoint:** `POST /api/employee-contracts`

```json
{
  "employeeContractFolio": "QA-CON-02-CONTRATO",
  "employeeContractStartDate": "2024-01-01",
  "employeeContractStatus": "active",
  "employeeContractMonthlyNetSalary": 10000,
  "employeeContractTypeId": <id del tipo de contrato, resuelto en Preparar>,
  "employeeId": <id de QA-CON-02>,
  "departmentId": <id de QA-CON-DA2>,
  "positionId": <id de QA-CON-PA2>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeContractActive": 1
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Employee contracts",
  "message": "The employee contract was created successfully",
  "data": {
    "employeeContract": {
      "employeeContractId": <id nuevo>,
      "employeeContractFolio": "QA-CON-02-CONTRATO",
      "departmentId": <id de QA-CON-DA2>,
      "positionId": <id de QA-CON-PA2>,
      "...": "..."
    }
  }
}
```

Confirmación del paso 1: al ser el contrato más reciente, con estructura vigente y de su empresa, el colaborador la toma. Consulta SQL:
`SELECT d.department_code, p.position_code FROM employees e LEFT JOIN departments d ON d.department_id = e.department_id LEFT JOIN positions p ON p.position_id = e.position_id WHERE e.employee_payroll_code = 'QA-CON-02';`
Resultado: 1 fila con `QA-CON-DA2` y `QA-CON-PA2`.

El identificador del contrato para el paso 2:

```sql
SELECT employee_contract_id FROM employee_contracts WHERE employee_contract_folio = 'QA-CON-02-CONTRATO';
```

**Paso 2 — Editar el contrato con `departmentId` y `positionId` en `null`.**

**Endpoint:** `PUT /api/employee-contracts/<id del contrato QA-CON-02-CONTRATO>`

```json
{
  "employeeContractFolio": "QA-CON-02-CONTRATO",
  "employeeContractStartDate": "2024-01-01",
  "employeeContractStatus": "active",
  "employeeContractMonthlyNetSalary": 10000,
  "employeeContractTypeId": <id del tipo de contrato, resuelto en Preparar>,
  "employeeId": <id de QA-CON-02>,
  "departmentId": null,
  "positionId": null,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeContractActive": 1
}
```

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Employee contracts",
  "message": "The employee contract was updated successfully",
  "data": {
    "employeeContract": {
      "employeeContractId": <id del contrato>,
      "departmentId": null,
      "positionId": null,
      "...": "..."
    }
  }
}
```

Confirmación de las consecuencias del paso 2:

1. El contrato quedó sin asignar. Consulta SQL:
   `SELECT d.department_code, p.position_code FROM employee_contracts c LEFT JOIN departments d ON d.department_id = c.department_id LEFT JOIN positions p ON p.position_id = c.position_id WHERE c.employee_contract_folio = 'QA-CON-02-CONTRATO';`
   Resultado: 1 fila con `NULL` y `NULL`.

2. El colaborador conserva lo suyo. Consulta SQL:
   `SELECT d.department_code, p.position_code FROM employees e LEFT JOIN departments d ON d.department_id = e.department_id LEFT JOIN positions p ON p.position_id = e.position_id WHERE e.employee_payroll_code = 'QA-CON-02';`
   Resultado: 1 fila con `QA-CON-DA2` y `QA-CON-PA2` (no se vacía ni vuelve a `QA-CON-DA1`).

Qué significa lo nuevo aquí:

- `message` con `updated`: el contrato ya existente se modificó (en el alta decía `created`).
- (Los demás datos son los ya explicados en el Escenario 1.)

### Escenario 3 — Editar sin mandar departamento ni puesto conserva los del contrato

Objetivo: lo mismo que el Escenario 2, pero en vez de mandar `null` se omiten por completo las dos llaves, para comprobar que «no decir nada» conserva lo guardado y «decir `null`» lo borra.

Usuario: **A**. Colaborador: `QA-CON-03`.

**Paso 1 — Alta con departamento y puesto.**

**Endpoint:** `POST /api/employee-contracts`

```json
{
  "employeeContractFolio": "QA-CON-03-CONTRATO",
  "employeeContractStartDate": "2024-01-01",
  "employeeContractStatus": "active",
  "employeeContractMonthlyNetSalary": 10000,
  "employeeContractTypeId": <id del tipo de contrato, resuelto en Preparar>,
  "employeeId": <id de QA-CON-03>,
  "departmentId": <id de QA-CON-DA2>,
  "positionId": <id de QA-CON-PA2>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeContractActive": 1
}
```

**Response exacto:** `201` (los datos son los ya explicados en el Escenario 1, con `departmentId` y `positionId` con los ids de `QA-CON-DA2` y `QA-CON-PA2`).

El identificador del contrato para el paso 2:

```sql
SELECT employee_contract_id FROM employee_contracts WHERE employee_contract_folio = 'QA-CON-03-CONTRATO';
```

**Paso 2 — Editar el sueldo sin mandar `departmentId` ni `positionId`.**

**Endpoint:** `PUT /api/employee-contracts/<id del contrato QA-CON-03-CONTRATO>`

```json
{
  "employeeContractFolio": "QA-CON-03-CONTRATO",
  "employeeContractStartDate": "2024-01-01",
  "employeeContractStatus": "active",
  "employeeContractMonthlyNetSalary": 12345,
  "employeeContractTypeId": <id del tipo de contrato, resuelto en Preparar>,
  "employeeId": <id de QA-CON-03>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeContractActive": 1
}
```

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Employee contracts",
  "message": "The employee contract was updated successfully",
  "data": {
    "employeeContract": {
      "employeeContractId": <id del contrato>,
      "departmentId": <id de QA-CON-DA2>,
      "positionId": <id de QA-CON-PA2>,
      "...": "..."
    }
  }
}
```

Confirmación de las consecuencias:

1. La edición sí se aplicó y la estructura se conservó. Consulta SQL:
   `SELECT c.employee_contract_monthly_net_salary, d.department_code, p.position_code FROM employee_contracts c LEFT JOIN departments d ON d.department_id = c.department_id LEFT JOIN positions p ON p.position_id = c.position_id WHERE c.employee_contract_folio = 'QA-CON-03-CONTRATO';`
   Resultado: 1 fila con sueldo `12345` (puede verse como `12345.00`), `QA-CON-DA2` y `QA-CON-PA2`.

Qué significa lo nuevo aquí:

- `employee_contract_monthly_net_salary` (en la consulta): el sueldo mensual neto del contrato; ver `12345` es la prueba de que la edición se aplicó aunque no se tocó la estructura.
- (Los demás datos son los ya explicados en los Escenarios 1 y 2: aquí `departmentId` y `positionId` conservan los ids de `QA-CON-DA2` y `QA-CON-PA2` porque no se mandó ninguna de las dos llaves.)

### Escenario 4 — Al borrar el contrato reciente, no se copia un departamento ya dado de baja

Objetivo: comprobar que cuando se borra el contrato más reciente y el que queda como más reciente apunta a un departamento que ya se dio de baja, el colaborador no lo recibe y sigue con el que tenía.

Usuario: **A**. Colaborador: `QA-CON-04`, que ya trae el contrato antiguo `QA-CON-04-ANTIGUO` (su departamento está dado de baja). Antes de empezar, confírmalo:

```sql
SELECT department_code, department_deleted_at IS NOT NULL AS dado_de_baja FROM departments WHERE department_code = 'QA-CON-DBAJA';
```

Resultado: 1 fila con `QA-CON-DBAJA` y `1` (sí está dado de baja).

**Paso 1 — Alta de un contrato más reciente con departamento y puesto de la empresa de prueba.**

**Endpoint:** `POST /api/employee-contracts`

```json
{
  "employeeContractFolio": "QA-CON-04-RECIENTE",
  "employeeContractStartDate": "2024-01-01",
  "employeeContractStatus": "active",
  "employeeContractMonthlyNetSalary": 10000,
  "employeeContractTypeId": <id del tipo de contrato, resuelto en Preparar>,
  "employeeId": <id de QA-CON-04>,
  "departmentId": <id de QA-CON-DA2>,
  "positionId": <id de QA-CON-PA2>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeContractActive": 1
}
```

**Response exacto:** `201` (datos ya explicados en el Escenario 1). El colaborador pasa a `QA-CON-DA2` / `QA-CON-PA2`; compruébalo con:
`SELECT d.department_code, p.position_code FROM employees e LEFT JOIN departments d ON d.department_id = e.department_id LEFT JOIN positions p ON p.position_id = e.position_id WHERE e.employee_payroll_code = 'QA-CON-04';`
Resultado: 1 fila con `QA-CON-DA2` y `QA-CON-PA2`.

El identificador del contrato para el paso 2:

```sql
SELECT employee_contract_id FROM employee_contracts WHERE employee_contract_folio = 'QA-CON-04-RECIENTE';
```

**Paso 2 — Borrar el contrato reciente.**

**Endpoint:** `DELETE /api/employee-contracts/<id del contrato QA-CON-04-RECIENTE>`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Employee contracts",
  "message": "The employee contract was deleted successfully",
  "data": {
    "employeeContract": {
      "employeeContractId": <id del contrato>,
      "employeeContractFolio": "QA-CON-04-RECIENTE",
      "...": "..."
    }
  }
}
```

Confirmación de las consecuencias:

1. El contrato reciente ya no está vigente. Consulta SQL:
   `SELECT employee_contract_folio FROM employee_contracts WHERE employee_id = <id de QA-CON-04> AND employee_contract_deleted_at IS NULL;`
   Resultado: 1 fila con `QA-CON-04-ANTIGUO` (el reciente ya no aparece).

2. El colaborador no recibió el departamento dado de baja. Consulta SQL:
   `SELECT d.department_code, p.position_code FROM employees e LEFT JOIN departments d ON d.department_id = e.department_id LEFT JOIN positions p ON p.position_id = e.position_id WHERE e.employee_payroll_code = 'QA-CON-04';`
   Resultado: 1 fila con `QA-CON-DA2` y `QA-CON-PA2` (no `QA-CON-DBAJA`).

Qué significa lo nuevo aquí:

- `message` con `deleted`: el contrato se dio de baja (ya no cuenta como vigente).
- (Los demás datos son los ya explicados en el Escenario 1.)

### Escenario 5 — Departamento o puesto de otra empresa: se rechaza y nada de otra empresa llega al colaborador

Objetivo: comprobar que la estructura de otra empresa nunca llega al colaborador: ni al intentar guardarla en un contrato nuevo (se rechaza sin guardar nada), ni cuando ya venía en un contrato antiguo que pasa a ser el más reciente.

Usuario: **A**. Colaborador: `QA-CON-05`, que ya trae el contrato antiguo `QA-CON-05-LEGADO` con el departamento y el puesto de la empresa ajena.

**Paso 1 — Contrato con el departamento de la empresa ajena.**

**Endpoint:** `POST /api/employee-contracts`

```json
{
  "employeeContractFolio": "QA-CON-05-RECHAZADO",
  "employeeContractStartDate": "2024-01-01",
  "employeeContractStatus": "active",
  "employeeContractMonthlyNetSalary": 10000,
  "employeeContractTypeId": <id del tipo de contrato, resuelto en Preparar>,
  "employeeId": <id de QA-CON-05>,
  "departmentId": <id de QA-CON-DB1>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeContractActive": 1
}
```

**Response exacto:** `400`

```json
{
  "type": "warning",
  "title": "The department was not found",
  "message": "The department was not found with the entered ID",
  "data": { "...": "..." }
}
```

**Paso 2 — Contrato con el puesto de la empresa ajena.**

**Endpoint:** `POST /api/employee-contracts`

```json
{
  "employeeContractFolio": "QA-CON-05-RECHAZADO",
  "employeeContractStartDate": "2024-01-01",
  "employeeContractStatus": "active",
  "employeeContractMonthlyNetSalary": 10000,
  "employeeContractTypeId": <id del tipo de contrato, resuelto en Preparar>,
  "employeeId": <id de QA-CON-05>,
  "positionId": <id de QA-CON-PB1>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeContractActive": 1
}
```

**Response exacto:** `400`

```json
{
  "type": "warning",
  "title": "The position was not found",
  "message": "The position was not found with the entered ID",
  "data": { "...": "..." }
}
```

Confirmación de las consecuencias de los pasos 1 y 2 (una por una):

1. No se guardó ningún contrato. Consulta SQL:
   `SELECT employee_contract_folio FROM employee_contracts WHERE employee_contract_folio = 'QA-CON-05-RECHAZADO';`
   Resultado: 0 filas.

2. El colaborador no cambió. Consulta SQL:
   `SELECT d.department_code, p.position_code FROM employees e LEFT JOIN departments d ON d.department_id = e.department_id LEFT JOIN positions p ON p.position_id = e.position_id WHERE e.employee_payroll_code = 'QA-CON-05';`
   Resultado: 1 fila con `QA-CON-DA1` y `QA-CON-PA1`.

**Paso 3 — Alta de un contrato más reciente con estructura de la empresa de prueba.**

**Endpoint:** `POST /api/employee-contracts`

```json
{
  "employeeContractFolio": "QA-CON-05-RECIENTE",
  "employeeContractStartDate": "2024-01-01",
  "employeeContractStatus": "active",
  "employeeContractMonthlyNetSalary": 10000,
  "employeeContractTypeId": <id del tipo de contrato, resuelto en Preparar>,
  "employeeId": <id de QA-CON-05>,
  "departmentId": <id de QA-CON-DA2>,
  "positionId": <id de QA-CON-PA2>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeContractActive": 1
}
```

**Response exacto:** `201` (datos ya explicados en el Escenario 1). El colaborador pasa a `QA-CON-DA2` / `QA-CON-PA2`.

El identificador del contrato para el paso 4:

```sql
SELECT employee_contract_id FROM employee_contracts WHERE employee_contract_folio = 'QA-CON-05-RECIENTE';
```

**Paso 4 — Borrar el contrato reciente, para que el antiguo (con estructura ajena) vuelva a ser el más reciente.**

**Endpoint:** `DELETE /api/employee-contracts/<id del contrato QA-CON-05-RECIENTE>`

**Response exacto:** `200` (el mismo envelope del Escenario 4: `"message": "The employee contract was deleted successfully"`).

Confirmación de la consecuencia del paso 4:

1. El colaborador no recibió la estructura de la empresa ajena. Consulta SQL:
   `SELECT d.department_code, p.position_code FROM employees e LEFT JOIN departments d ON d.department_id = e.department_id LEFT JOIN positions p ON p.position_id = e.position_id WHERE e.employee_payroll_code = 'QA-CON-05';`
   Resultado: 1 fila con `QA-CON-DA2` y `QA-CON-PA2` (no `QA-CON-DB1` ni `QA-CON-PB1`).

Qué significa lo nuevo aquí:

- `type: "warning"` con `title` `The department was not found` / `The position was not found`: no se guardó porque el departamento o el puesto no existe **en la empresa de prueba**. El mismo cuerpo sale si el valor no existe en absoluto o ya se dio de baja: desde afuera no se puede saber cuál de los tres motivos fue, a propósito, para que nadie descubra qué hay en otras empresas.
- `data`: lo que se intentó guardar; no importa aquí, `title` y `message` ya dicen el motivo.
- (Los demás datos son los ya explicados en los Escenarios 1 y 4.)

### Escenario 6 — Al borrar el único contrato, el colaborador conserva su estructura

Objetivo: comprobar que un colaborador que se queda sin ningún contrato vigente no pierde su departamento ni su puesto.

Usuario: **A**. Colaborador: `QA-CON-06`.

**Paso 1 — Alta con departamento y puesto.**

**Endpoint:** `POST /api/employee-contracts`

```json
{
  "employeeContractFolio": "QA-CON-06-UNICO",
  "employeeContractStartDate": "2024-01-01",
  "employeeContractStatus": "active",
  "employeeContractMonthlyNetSalary": 10000,
  "employeeContractTypeId": <id del tipo de contrato, resuelto en Preparar>,
  "employeeId": <id de QA-CON-06>,
  "departmentId": <id de QA-CON-DA2>,
  "positionId": <id de QA-CON-PA2>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeContractActive": 1
}
```

**Response exacto:** `201` (datos ya explicados en el Escenario 1). El colaborador pasa a `QA-CON-DA2` / `QA-CON-PA2`.

El identificador del contrato para el paso 2:

```sql
SELECT employee_contract_id FROM employee_contracts WHERE employee_contract_folio = 'QA-CON-06-UNICO';
```

**Paso 2 — Borrar el único contrato.**

**Endpoint:** `DELETE /api/employee-contracts/<id del contrato QA-CON-06-UNICO>`

**Response exacto:** `200` (el mismo envelope del Escenario 4: `"message": "The employee contract was deleted successfully"`).

Confirmación de las consecuencias:

1. No queda ningún contrato vigente. Consulta SQL:
   `SELECT COUNT(*) AS vigentes FROM employee_contracts WHERE employee_id = <id de QA-CON-06> AND employee_contract_deleted_at IS NULL;`
   Resultado: `0`.

2. El colaborador conserva su estructura. Consulta SQL:
   `SELECT d.department_code, p.position_code FROM employees e LEFT JOIN departments d ON d.department_id = e.department_id LEFT JOIN positions p ON p.position_id = e.position_id WHERE e.employee_payroll_code = 'QA-CON-06';`
   Resultado: 1 fila con `QA-CON-DA2` y `QA-CON-PA2` (ni `NULL` ni un departamento de relleno).

(Los datos son los ya explicados en los Escenarios 1 y 4.)

### Escenario 7 — `departmentId` en `0`: aviso claro de datos no válidos, sin guardar nada

Objetivo: comprobar que un departamento con valor `0` (que no es un identificador posible) se rechaza con un aviso de datos no válidos, tanto al crear como al editar un contrato, y que no se guarda ni se modifica nada.

Usuario: **A**. Colaborador: `QA-CON-07`, que ya trae el contrato `QA-CON-07-BASE` con `QA-CON-DA2` / `QA-CON-PA2`.

**Paso 1 — Alta con `departmentId: 0`.**

**Endpoint:** `POST /api/employee-contracts`

```json
{
  "employeeContractFolio": "QA-CON-07-ALTA",
  "employeeContractStartDate": "2024-01-01",
  "employeeContractStatus": "active",
  "employeeContractMonthlyNetSalary": 10000,
  "employeeContractTypeId": <id del tipo de contrato, resuelto en Preparar>,
  "employeeId": <id de QA-CON-07>,
  "departmentId": 0,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeContractActive": 1
}
```

**Response exacto:** `422`

```json
{
  "type": "warning",
  "title": "Datos del contrato no válidos",
  "message": "Revisa los datos del contrato",
  "detail": "El campo departmentId debe ser mayor o igual a 1",
  "error": "El campo departmentId debe ser mayor o igual a 1",
  "errors": [
    {
      "message": "El campo departmentId debe ser mayor o igual a 1",
      "rule": "min",
      "field": "departmentId",
      "meta": { "min": 1 }
    }
  ],
  "key": "datos-del-contrato-no-validos",
  "code": "EMP.CONTRACT.VAL_INPUT"
}
```

Confirmación: no se guardó nada. Consulta SQL:
`SELECT employee_contract_folio FROM employee_contracts WHERE employee_contract_folio = 'QA-CON-07-ALTA';`
Resultado: 0 filas.

**Paso 2 — Edición con `departmentId: 0`.** Primero resuelve el identificador del contrato sembrado:

```sql
SELECT employee_contract_id FROM employee_contracts WHERE employee_contract_folio = 'QA-CON-07-BASE';
```

**Endpoint:** `PUT /api/employee-contracts/<id del contrato QA-CON-07-BASE>`

```json
{
  "employeeContractFolio": "QA-CON-07-BASE",
  "employeeContractStartDate": "2024-01-01",
  "employeeContractStatus": "active",
  "employeeContractMonthlyNetSalary": 55555,
  "employeeContractTypeId": <id del tipo de contrato, resuelto en Preparar>,
  "employeeId": <id de QA-CON-07>,
  "departmentId": 0,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeContractActive": 1
}
```

**Response exacto:** `422` (el mismo cuerpo del paso 1).

Confirmación de las consecuencias del paso 2:

1. El contrato no cambió. Consulta SQL:
   `SELECT c.employee_contract_monthly_net_salary, d.department_code, p.position_code FROM employee_contracts c LEFT JOIN departments d ON d.department_id = c.department_id LEFT JOIN positions p ON p.position_id = c.position_id WHERE c.employee_contract_folio = 'QA-CON-07-BASE';`
   Resultado: 1 fila con sueldo `10000` (puede verse como `10000.00`, no `55555`), `QA-CON-DA2` y `QA-CON-PA2`.

2. El colaborador no cambió. Consulta SQL:
   `SELECT d.department_code, p.position_code FROM employees e LEFT JOIN departments d ON d.department_id = e.department_id LEFT JOIN positions p ON p.position_id = e.position_id WHERE e.employee_payroll_code = 'QA-CON-07';`
   Resultado: 1 fila con `QA-CON-DA1` y `QA-CON-PA1`.

Qué significa lo nuevo aquí:

- `title` / `message`: el aviso general de que algún dato del contrato no es válido; nunca sale la pantalla de error general del servidor por esto.
- `detail` / `error`: el primer motivo concreto, en palabras claras (los dos traen el mismo texto). El texto exacto sigue el idioma de la instancia: el ambiente local responde en español, como arriba; en una instancia en inglés diría `The departmentId field must be at least 1`.
- `errors`: la lista de todos los campos que no pasaron y por qué; no hace falta leerla, `detail` ya la resume.
- `key`: clave fija de este tipo de rechazo; aquí vale `datos-del-contrato-no-validos` (los datos del contrato no son válidos).
- `code`: identificador estable del rechazo, no cambia aunque cambie el idioma; puede valer `EMP.CONTRACT.VAL_INPUT` (algún dato del contrato no es válido — el único valor que se provoca en este manual).
- (Los demás datos son los ya explicados en el Escenario 1.)

## 3. Importación de colaboradores desde Excel (Escenarios 8, 9 y 10)

**Endpoint de plantilla:** `GET /api/employees/template-excel` (con los mismos headers). Descarga el archivo `.xlsx` y trabaja sobre él. Se recomienda una copia del archivo por escenario.

**Endpoint de subida:** `POST /api/employees/import-excel`

Se envía como `multipart/form-data`, en el campo `file`, cuyo valor es el archivo Excel (no su contenido pegado). Extensión aceptada: `.xlsx`.

Cómo llenar el archivo (en los tres escenarios, la fila de datos es la **fila 2**; borra cualquier fila de ejemplo que traiga la plantilla y deja vacías todas las columnas que no se mencionan):

- **`ID Empleado`** (la primera columna, oculta): vacía = alta de un colaborador nuevo; con el identificador de un colaborador = actualización de ese colaborador.
- **`Identificador de nómina`**: obligatorio. En las altas lleva la marca `<fecha-hora>`, que debes sustituir por la fecha y hora de tu corrida (por ejemplo `20260929-1130`) para que no se repita entre corridas.
- **`Unidad de negocio de trabajo`** y **`Unidad de negocio de nómina`**: se dejan vacías; vacía = la empresa activa (la de prueba).
- **`Nombre del empleado`** y **`Apellido paterno del empleado`**: obligatorios.
- **`Departamento`** y **`Posición`**: vacía = sin dato. En una fila nueva, una celda vacía (o cuyo texto no se parece a ningún departamento o puesto de la empresa) deja al colaborador sin asignar; en una fila de actualización, una celda vacía conserva lo que el colaborador ya tenía.

Antes de los Escenarios 8 y 9 confirma que el departamento real llamado `Sin departamento` existe en la empresa de prueba (es la trampa: antes de esta historia atraía a las filas vacías):

```sql
SELECT department_code, department_name FROM departments WHERE department_code = 'QA-CON-DSIN' AND department_deleted_at IS NULL;
```

Resultado: 1 fila con `QA-CON-DSIN` y `Sin departamento`.

**Advertencia que no cuenta como fallo.** Al crear colaboradores, el sistema intenta avisar a un servicio externo de asistencia que este ambiente local normalmente no tiene levantado. Si es así, la respuesta de los Escenarios 8 y 9 puede venir como `type` `warning`, `title` `Importación completada con advertencias`, con un texto en `data.warnings` que empieza con `Error al sincronizar con biométricos`; en ese caso el `message` dice `Se procesaron 1 empleados: 1 creados, 0 actualizados. 0 filas con error.` Ese aviso no es fallo del escenario: lo que cuenta es `data.summary` y que `data.rowErrors` esté vacío.

### Escenario 8 — Fila nueva con departamento y puesto vacíos: queda sin asignar, aunque exista un departamento «Sin departamento»

Objetivo: comprobar que un colaborador nuevo importado sin departamento ni puesto queda sin asignar y no es mandado al departamento real llamado «Sin departamento», que antes atraía a las filas vacías.

Usuario: **A**.

Archivo (una fila de datos):

| Fila | ID Empleado | Identificador de nómina | Unidad de negocio de trabajo | Unidad de negocio de nómina | Nombre del empleado | Apellido paterno del empleado | Departamento | Posición |
|---:|---|---|---|---|---|---|---|---|
| 2 | *(vacía)* | `QA-CON-IMP-<fecha-hora>-A` | *(vacía)* | *(vacía)* | `Importado` | `SinDepartamento` | *(vacía)* | *(vacía)* |

Qué produce la fila: la fila 2 crea un colaborador nuevo, sin departamento y sin puesto.

**Endpoint:** `POST /api/employees/import-excel`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Importación completada",
  "message": "Importación exitosa: 1 empleados creados, 0 empleados actualizados.",
  "data": {
    "summary": {
      "totalRows": 1,
      "processed": 1,
      "created": 1,
      "updated": 0,
      "failed": 0,
      "skipped": 0,
      "limitReached": false
    },
    "rowErrors": [],
    "warnings": [],
    "errors": []
  }
}
```

(Si el ambiente trae el aviso de biométricos descrito arriba, `type`, `title`, `message` y `warnings` cambian como ahí se dice; `summary` y `rowErrors` son los mismos.)

Confirmación de la consecuencia:

1. El colaborador quedó sin asignar y no en «Sin departamento». Consulta SQL:
   `SELECT e.department_id, e.position_id, d.department_name FROM employees e LEFT JOIN departments d ON d.department_id = e.department_id WHERE e.employee_payroll_code = 'QA-CON-IMP-<fecha-hora>-A';`
   Resultado: 1 fila con `NULL`, `NULL` y `NULL`.

Qué significa cada dato:

- `type`: resultado general. Puede valer `success` (se hizo todo lo pedido — el que se prueba aquí), `warning` (se procesó el archivo, pero hubo avisos o filas con error — solo se ve aquí por el aviso de biométricos) o `error` (no se procesó el archivo; no se provoca en este manual).
- `title` / `message`: resumen legible del resultado y de las cantidades.
- `data.summary.totalRows`: filas de colaboradores recibidas en el archivo.
- `data.summary.processed`: filas que sí terminaron de guardarse.
- `data.summary.created`: colaboradores nuevos.
- `data.summary.updated`: colaboradores existentes modificados.
- `data.summary.failed`: filas que tuvieron error.
- `data.summary.skipped`: filas omitidas.
- `data.summary.limitReached`: puede valer `false` (el cupo de colaboradores no detuvo la carga) o `true` (el cupo sí la detuvo; no se provoca aquí).
- `data.rowErrors`: filas que no pudieron guardarse y su motivo; vacía quiere decir que todas se guardaron.
- `data.warnings`: avisos que no impidieron terminar la carga.
- `data.errors`: la misma lista de errores por fila en el formato anterior que todavía consume la aplicación.

### Escenario 9 — Fila nueva con el nombre exacto de un departamento: se asigna

Objetivo: lo mismo que el Escenario 8, pero con el nombre exacto de un departamento real en la celda, para comprobar que el vacío solo aplica cuando no hay dato: si el nombre coincide, el colaborador sí queda en ese departamento (y el puesto, que sigue vacío, queda sin asignar).

Usuario: **A**.

Archivo (una fila de datos):

| Fila | ID Empleado | Identificador de nómina | Unidad de negocio de trabajo | Unidad de negocio de nómina | Nombre del empleado | Apellido paterno del empleado | Departamento | Posición |
|---:|---|---|---|---|---|---|---|---|
| 2 | *(vacía)* | `QA-CON-IMP-<fecha-hora>-B` | *(vacía)* | *(vacía)* | `Importado` | `ConDepartamento` | `QA Contrato Depto A2` | *(vacía)* |

Qué produce la fila: la fila 2 crea un colaborador nuevo en el departamento `QA-CON-DA2` (cuyo nombre es `QA Contrato Depto A2`), sin puesto.

**Endpoint:** `POST /api/employees/import-excel`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Importación completada",
  "message": "Importación exitosa: 1 empleados creados, 0 empleados actualizados.",
  "data": {
    "summary": {
      "totalRows": 1,
      "processed": 1,
      "created": 1,
      "updated": 0,
      "failed": 0,
      "skipped": 0,
      "limitReached": false
    },
    "rowErrors": [],
    "warnings": [],
    "errors": []
  }
}
```

(Los datos son los ya explicados en el Escenario 8, incluida la advertencia de biométricos que no cuenta como fallo.)

Confirmación de la consecuencia:

1. El colaborador quedó en `QA-CON-DA2` y sin puesto. Consulta SQL:
   `SELECT d.department_code, p.position_code FROM employees e LEFT JOIN departments d ON d.department_id = e.department_id LEFT JOIN positions p ON p.position_id = e.position_id WHERE e.employee_payroll_code = 'QA-CON-IMP-<fecha-hora>-B';`
   Resultado: 1 fila con `QA-CON-DA2` y `NULL`.

### Escenario 10 — Reimportar a un colaborador existente con las celdas vacías conserva su estructura

Objetivo: comprobar que reimportar a un colaborador que ya existe, con el departamento y el puesto vacíos, no se los borra ni se los cambia por ningún relleno: conserva los que tenía.

Usuario: **A**. Colaborador: `QA-CON-10` (empieza en `QA-CON-DA1` / `QA-CON-PA1`).

Archivo (una fila de datos; el `ID Empleado` es el de `QA-CON-10` resuelto en Preparar, escrito como número):

| Fila | ID Empleado | Identificador de nómina | Unidad de negocio de trabajo | Unidad de negocio de nómina | Nombre del empleado | Apellido paterno del empleado | Departamento | Posición |
|---:|---|---|---|---|---|---|---|---|
| 2 | `<id de QA-CON-10>` | `QA-CON-10` | *(vacía)* | *(vacía)* | `Contrato` | `QA-CON-10` | *(vacía)* | *(vacía)* |

Qué produce la fila: la fila 2, al traer `ID Empleado`, actualiza a `QA-CON-10` (no crea a nadie) y, al venir vacías las celdas de departamento y puesto, no toca su estructura.

**Endpoint:** `POST /api/employees/import-excel`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Importación completada",
  "message": "Importación exitosa: 0 empleados creados, 1 empleados actualizados.",
  "data": {
    "summary": {
      "totalRows": 1,
      "processed": 1,
      "created": 0,
      "updated": 1,
      "failed": 0,
      "skipped": 0,
      "limitReached": false
    },
    "rowErrors": [],
    "warnings": [],
    "errors": []
  }
}
```

(Los datos son los ya explicados en el Escenario 8. Aquí no se crea a nadie, así que el aviso de biométricos no aparece.)

Confirmación de la consecuencia:

1. El colaborador conserva su estructura. Consulta SQL:
   `SELECT d.department_code, p.position_code FROM employees e LEFT JOIN departments d ON d.department_id = e.department_id LEFT JOIN positions p ON p.position_id = e.position_id WHERE e.employee_payroll_code = 'QA-CON-10';`
   Resultado: 1 fila con `QA-CON-DA1` y `QA-CON-PA1`.

## 4. Lo que no se revisa aquí

- **Colaboradores creados por el sincronizador de biométricos sin departamento ni puesto:** no es revisable aquí; depende de un servicio externo de asistencia que este ambiente no levanta.
- **El cambio en la base de datos que permite guardar un contrato sin estructura:** no lleva escenario propio; los Escenarios 1 y 2 lo demuestran al guardar contratos sin departamento y sin puesto.

## 5. Checklist

- [ ] Escenario 1: contrato sin departamento ni puesto se guarda sin asignar y `QA-CON-01` conserva `QA-CON-DA1` / `QA-CON-PA1`
- [ ] Escenario 2: editar con `null` deja el contrato sin asignar y `QA-CON-02` conserva `QA-CON-DA2` / `QA-CON-PA2`
- [ ] Escenario 3: editar sin mandar las llaves conserva `QA-CON-DA2` / `QA-CON-PA2` en el contrato de `QA-CON-03` y aplica el nuevo sueldo
- [ ] Escenario 4: al borrar el contrato reciente de `QA-CON-04`, no recibe el departamento dado de baja
- [ ] Escenario 5: departamento y puesto de otra empresa dan `400` sin guardar nada, y `QA-CON-05` no recibe la estructura ajena de su contrato antiguo
- [ ] Escenario 6: al borrar su único contrato, `QA-CON-06` conserva `QA-CON-DA2` / `QA-CON-PA2`
- [ ] Escenario 7: `departmentId: 0` da `422` con `EMP.CONTRACT.VAL_INPUT` en el alta y en la edición, sin guardar ni modificar nada
- [ ] Escenario 8: fila nueva con celdas vacías crea al colaborador sin asignar, no en «Sin departamento»
- [ ] Escenario 9: fila nueva con el nombre exacto de `QA Contrato Depto A2` deja al colaborador en `QA-CON-DA2`
- [ ] Escenario 10: reimportar a `QA-CON-10` con celdas vacías conserva `QA-CON-DA1` / `QA-CON-PA1`
