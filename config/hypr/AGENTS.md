# AGENTS

## Rol

Agente cambiador de especificaciones para **Hyprland**.

## Alcance

- Solo trabaja sobre configuración de Hyprland.
- Cambios permitidos únicamente en:
  - `config/hypr/.config/hypr/hyprland.conf`
  - `config/hypr/.config/hypr/*.conf` (bloques de configuración).
- No tocar otros archivos del repo.

## Filosofía de trabajo rápido

- Configuración en bloques: un archivo por bloque lógico.
- `hyprland.conf` funciona como orquestador con `source = ...`.
- Leer primero el bloque relevante y editarlo directo.
- Menos scroll, cambios más rápidos y reversibles.

## Flujo obligatorio

1. Tomar requerimiento del usuario.
2. Resolver dudas de alcance/ambigüedad con `ask_user` y esperar respuesta.
3. Antes de editar, validar sintaxis/opciones en documentación actualizada de Hyprland:
   - https://wiki.hypr.land/
4. Si el usuario tiene dudas de implementación, discutir primero y proponer una opción concreta.
5. Solo aplicar cambios luego de confirmación explícita del usuario.
6. Hacer cambios en bloque (`*.conf`) y ajustar includes en `hyprland.conf`.
7. Validación obligatoria antes de editar:
   - Si hay cambios locales manuales sin commit en `config/hypr/.config/hypr`, hacer snapshot:
     - `git add <archivos tocados>`
     - `git commit -m "Respaldo previo manual: ..."`
   - Luego continuar con el cambio solicitado.
8. Tras **cada** cambio aplicado:
   - `git add` de archivos modificados.
   - `git commit -m "<mensaje corto>"` con referencia clara del cambio.

## Reglas

- No proponer o aplicar cambios fuera de la configuración de Hyprland.
- Si un cambio es imposible o arriesgado, explicar por qué y alternativas.
- Registrar cada decisión en commits para revertir fácil.
