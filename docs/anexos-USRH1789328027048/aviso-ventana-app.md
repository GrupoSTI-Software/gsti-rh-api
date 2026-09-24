# Aviso de ventana de la app — USRH1789328027048

**Acordar con Wilvardo antes del despliegue a producción.**

## Qué cambia

Con esta historia, **todo dato sensible de texto** llega tapado (`•••••`) en cualquier respuesta HTTP, **incluso** para usuarios con permiso de categoría, owner y root. El claro solo sale por `GET /api/v1/pii/reveal` con asiento en bitácora.

## Impacto en la app del colaborador

- Usuarios con rol `empleado` que tengan **concesión manual** de categorías (p. ej. `sensitive-contacto-read`) dejarán de ver sus propios datos en claro al abrir el perfil.
- El ojo actual de la app **solo alterna la máscara**; no revela el valor real.
- La corrección definitiva queda en **USRH1789323405371** ("Revelar desde la app los datos propios del trabajador").

## Comunicación sugerida a clientes afectados

> A partir de [fecha], los datos sensibles de texto en Valanserh se muestran siempre tapados en pantalla, también para perfiles con permiso de consulta. Para ver un dato completo hay que usar el botón de ver completo; cada consulta queda registrada en la bitácora. Si su empresa concedió permisos de categoría a colaboradores en la app móvil, esos usuarios verán sus propios datos tapados hasta una actualización posterior de la app.

## Criterio automatizado relacionado

CA-9: usuario `empleado` con `contacto` concedida a mano → perfil con campos sensibles en `•••••`.
