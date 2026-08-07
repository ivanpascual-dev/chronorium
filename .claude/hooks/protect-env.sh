#!/usr/bin/env bash
# Bloquea cualquier lectura o escritura de ficheros con secretos.
#
# Por qué existe: el proyecto anterior guardaba tres credenciales en texto plano en dos ficheros, y
# lo único que evitó que se filtraran fue que nunca llegó a versionarse. Aquí el repositorio es
# publico desde el primer dia, asi que la proteccion tiene que ser mecanica y no depender de que
# alguien se acuerde.
#
# Se cablea como hook PreToolUse en .claude/settings.json.
# Salida 0 = permitido. Salida 2 = bloqueado, y el motivo va por la salida de error.

set -euo pipefail

payload="$(cat)"

# Rutas protegidas: ficheros de entorno, de secretos y la configuracion con credencial del MCP.
patron='(^|/)\.env($|\.)|(^|/)\.dev\.vars|(^|/)secrets\.json$|(^|/)\.mcp\.json$|(^|/)\.npmrc$'

# El payload trae la ruta en file_path (herramientas de fichero) o dentro del comando (Bash).
objetivo="$(printf '%s' "$payload" | grep -oE '"(file_path|command)"[[:space:]]*:[[:space:]]*"[^"]*"' || true)"

if printf '%s' "$objetivo" | grep -qE "$patron"; then
  cat >&2 <<'EOF'
BLOQUEADO: ese fichero contiene o puede contener credenciales.

Los secretos de este proyecto se leen SOLO del entorno (regla R3 de CLAUDE.md). No hay ningun
fichero de secretos dentro del arbol del proyecto, y los de entorno no se leen ni se escriben
desde aqui.

Si necesitas saber que variables hacen falta, mira .env.example, que no tiene valores.
Si necesitas comprobar si una credencial esta presente y es valida, usa: chronorium validate
EOF
  exit 2
fi

exit 0
