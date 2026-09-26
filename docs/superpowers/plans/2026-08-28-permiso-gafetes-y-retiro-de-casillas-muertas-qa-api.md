# Prueba manual API — Permiso `generate-badges` en las rutas de gafete

**Problema:** Las cuatro rutas de gafete del backoffice (consultar, PDF, PNG y
lote) no validaban el permiso correcto en el servidor. Tres de ellas dependían
de `tab-foto-read` —el permiso de *ver la fotografía* del expediente, no el de
*generar un documento* con foto, nombre y número de empleado— y la de lote no
comprobaba ningún permiso. Cualquier usuario autenticado con acceso a la
empresa podía descargar gafetes aunque su rol no tuviera la casilla "generar
gafetes" marcada.

**Solución:** Las cuatro rutas ahora exigen el permiso **`generate-badges`**
del módulo Empleados —la misma casilla que ya mostraba u ocultaba el botón en
el backoffice— cuando el módulo tiene la exigencia de permisos encendida. Sin
ese permiso, el servidor responde `403`. `GET /me` (el gafete propio del
colaborador, usado por la app del empleado) queda exento a propósito: nunca
debe depender de un permiso de administración.

Cada paso indica el **endpoint** (método + ruta + body si aplica) y el
**response** exacto que debe llegar (status + body). Autenticación y headers
de sesión se asumen resueltos por tu cliente (Postman).

---

## 0. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Crea dos usuarios de prueba. Contraseña de ambos: **`password`**.

| Usuario | Correo | Permiso `generate-badges` |
|---|---|---|
| **A** | `qa-badge-with@gsti-tests.local` | Sí |
| **B** | `qa-badge-without@gsti-tests.local` | No |

También reutiliza al colaborador `QA-EMP-01` (activo, con foto) como objetivo
de las pruebas, y al usuario `qa-emp-02-user@gsti-tests.local` (atado al
colaborador `QA-EMP-02`) para el escenario de `/me`.

Consulta el `employee_id` numérico que va en las URLs `:employeeId`:

```sql
SELECT employee_id FROM employees WHERE employee_payroll_code = 'QA-EMP-01';
```

> **Importante:** `system_modules.system_module_permission_enforcement_active`
> es una bandera **global** (no por empresa). Al encenderla en el escenario 2
> se exige permiso explícito en **todas** las rutas de `employees` que ya usan
> `permissionGate`, no solo en gafetes. Si trabajas en una base de datos
> compartida, avisa antes de tocarla y apágala en cuanto termines (paso 5).

---

## 1. Escenario 1 — Exigencia apagada (estado por defecto)

```sql
UPDATE system_modules SET system_module_permission_enforcement_active = 0
WHERE system_module_slug = 'employees';
```

Usuario: **B** (`qa-badge-without`, sin `generate-badges`). Las cuatro rutas
deben responder **200** igual que hoy:

**Consultar:** `GET /api/employee-badges/{employeeId}`

**Response — 200:**

```json
{
  "type": "success",
  "title": "Gafete del empleado",
  "message": "Gafete obtenido correctamente",
  "data": { "gafete": { "empleadoId": 123, "...": "..." } }
}
```

**PDF:** `GET /api/employee-badges/{employeeId}/pdf`

**Response — 200**, `Content-Type: application/pdf` (stream binario).

**PNG:** `GET /api/employee-badges/{employeeId}/png`

**Response — 200**, `Content-Type: image/png` (stream binario).

**Lote:** `POST /api/employee-badges/bulk`

```json
{ "empleadoIds": [123], "formato": "pdf" }
```

**Response — 200**, `Content-Type: application/pdf` (stream binario).

---

## 2. Escenario 2 — Exigencia encendida + con permiso

```sql
UPDATE system_modules SET system_module_permission_enforcement_active = 1
WHERE system_module_slug = 'employees';
```

Usuario: **A** (`qa-badge-with`, sí tiene `generate-badges`). Repite las
mismas cuatro llamadas del escenario 1.

**Response esperado en las cuatro:** `200` (idéntico al escenario 1, solo que
ahora el permiso sí se evaluó y se cumplió).

---

## 3. Escenario 3 — Exigencia encendida + sin permiso (el caso nuevo)

Con la exigencia todavía **encendida**, cambia al Usuario **B**
(`qa-badge-without`, sin `generate-badges`) y repite las cuatro llamadas:

- `GET /api/employee-badges/{employeeId}`
- `GET /api/employee-badges/{employeeId}/pdf`
- `GET /api/employee-badges/{employeeId}/png`
- `POST /api/employee-badges/bulk` con `{ "empleadoIds": [123], "formato": "pdf" }`

**Response — 403 en las cuatro:**

```json
{
  "title": "Sin permiso",
  "detail": "No tienes permiso para realizar esta operación.",
  "key": "PERM.DENIED"
}
```

---

## 4. Escenario 4 — `/me` siempre exento (no lo gobierna `generate-badges`)

Da igual el estado de la exigencia (puede quedar encendida del paso anterior).

Usuario: `qa-emp-02-user@gsti-tests.local` (rol `qa-file-empty`, **sin**
`generate-badges`, atado al colaborador QA-EMP-02).

**Endpoint:** `GET /api/employee-badges/me`

**Response — 200** (nunca `403 PERM.DENIED`):

```json
{
  "type": "success",
  "title": "Gafete del empleado",
  "message": "Gafete obtenido correctamente",
  "data": { "gafete": { "empleadoId": "<id de QA-EMP-02>", "...": "..." } }
}
```

---

## 5. Limpieza (restaurar el ambiente)

```sql
UPDATE system_modules SET system_module_permission_enforcement_active = 0
WHERE system_module_slug = 'employees';
```

---

## 6. Checklist

- [ ] Escenario 1 (exigencia apagada): las 4 rutas responden `200` con el Usuario B (sin permiso)
- [ ] Escenario 2 (exigencia encendida, con permiso): las 4 rutas responden `200` con el Usuario A
- [ ] Escenario 3 (exigencia encendida, sin permiso): las 4 rutas responden `403` con `key: "PERM.DENIED"` con el Usuario B
- [ ] Escenario 4: `GET /api/employee-badges/me` responde `200` para el colaborador, sin importar el permiso ni el estado de la exigencia
- [ ] Se restauró `system_module_permission_enforcement_active = 0` al terminar
