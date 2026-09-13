#!/bin/bash
# ================================================
#          🔍 Control de Calidad del Mal
# ================================================
# Verifica que todos los planes cumplan las reglas
# de la Legión antes de ser aprobados por el Consejo.
#
# Reglas verificadas:
#   #1 - Todo plan debe tener un plan de escape
#   #2 - Los códigos de lanzamiento no deben estar en el repo
#   #3 - Fichas: Todos los villanos deben estar en estado activo
# ================================================

ERRORES=0
AVISOS=0

echo "╔══════════════════════════════════════╗"
echo "║      CONTROL DE CALIDAD DEL MAL      ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Revisión solicitada por: Lex Luthor"
echo "Ejecutada por: Brainiac v12.0"
echo "Fecha: $(date -u +"%d/%m/%Y - %H:%M UTC")"
echo ""

# ──────────────────────────────────────────
# Regla #1: Todo plan debe tener plan de escape
# ──────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Regla #1: Verificando planes de escape..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if ls planes/*.md 1>/dev/null 2>&1; then
  for plan in planes/*.md; do
    NOMBRE_PLAN=$(basename "$plan" .md)
    if ! grep -q "## Plan de escape" "$plan"; then
      echo "  ❌ $NOMBRE_PLAN — NO tiene plan de escape."
      echo "     → Rechazado por el Consejo. ¿Quieres que te atrape Batman?"
      ERRORES=$((ERRORES + 1))
    else
      echo "  ✅ $NOMBRE_PLAN — Plan de escape verificado."
    fi
  done
else
  echo "  ⚠️  No se encontraron planes en planes/"
  AVISOS=$((AVISOS + 1))
fi

echo ""

# ──────────────────────────────────────────
# Regla #3: Códigos de lanzamiento
# ──────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Regla #3: Verificando códigos de lanzamiento..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Buscar archivos .env rastreados por git
ARCHIVOS_ENV=$(git ls-files "*.env" 2>/dev/null)
if [ -n "$ARCHIVOS_ENV" ]; then
  echo "  ❌ ¡ALERTA ROJA! Archivos .env detectados en el repositorio:"
  echo "$ARCHIVOS_ENV" | while read -r archivo; do
    echo "     → $archivo"
  done
  echo "     ¡Quien los subió será entregado a Batman!"
  ERRORES=$((ERRORES + 1))
else
  echo "  ✅ No hay archivos .env rastreados por git."
  echo "     Los códigos de lanzamiento están a salvo."
fi

echo ""

# ──────────────────────────────────────────
# Verificar fichas de villanos
# ──────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Verificando fichas de villanos..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if ls miembros/*.yml 1>/dev/null 2>&1; then
  for ficha in miembros/*.yml; do
    NOMBRE=$(grep "^nombre:" "$ficha" | head -1 | sed 's/nombre: *//;s/"//g')
    if [ -z "$NOMBRE" ]; then
      NOMBRE=$(basename "$ficha" .yml)
    fi

    if ! grep -q "estado: activo" "$ficha"; then
      echo "  ⚠️  $NOMBRE — Estado no es 'activo'. ¿Capturado por los héroes?"
      AVISOS=$((AVISOS + 1))
    else
      echo "  ✅ $NOMBRE — Activo y listo para la misión."
    fi
  done
else
  echo "  ⚠️  No se encontraron fichas en miembros/"
  AVISOS=$((AVISOS + 1))
fi

echo ""

# ──────────────────────────────────────────
# Verificar expedientes de inteligencia
# ──────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Verificando inteligencia sobre héroes..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if ls inteligencia/perdedores/*.md 1>/dev/null 2>&1; then
  TOTAL_EXPEDIENTES=$(ls inteligencia/perdedores/*.md | wc -l)
  echo "  📁 $TOTAL_EXPEDIENTES expedientes de héroes en la base de datos."

  for expediente in inteligencia/perdedores/*.md; do
    HEROE=$(basename "$expediente" .md)
    if ! grep -q "## Estrategia recomendada" "$expediente"; then
      echo "  ⚠️  $HEROE — Falta la estrategia recomendada."
      echo "     → Brainiac: 'Un expediente sin estrategia es solo un póster.'"
      AVISOS=$((AVISOS + 1))
    else
      echo "  ✅ $HEROE — Expediente completo."
    fi
  done
else
  echo "  ⚠️  No se encontraron expedientes en inteligencia/"
  AVISOS=$((AVISOS + 1))
fi

echo ""

# ──────────────────────────────────────────
# Resultado final
# ──────────────────────────────────────────
echo "╔══════════════════════════════════════╗"
echo "║          RESULTADO FINAL             ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "  Errores críticos: $ERRORES"
echo "  Avisos:           $AVISOS"
echo ""

if [ $ERRORES -gt 0 ]; then
  echo "  ❌ RECHAZADO POR EL CONSEJO"
  echo ""
  echo "  Lex Luthor: 'Inaceptable. Corrijan esto antes del merge.'"
  echo "  Magneto: 'No toleraré incompetencia.'"
  echo ""
  exit 1
else
  if [ $AVISOS -gt 0 ]; then
    echo "  ✅ APROBADO CON OBSERVACIONES"
    echo ""
    echo "  Lex Luthor: 'Aprobado, pero revisen los avisos.'"
    echo ""
  else
    echo "  ✅ APROBADO POR EL CONSEJO"
    echo ""
    echo "  Lex Luthor: 'Perfecto. Procedan con la misión.'"
    echo "  Brainiac: 'Probabilidad de éxito: calculando...'"
    echo ""
  fi
  exit 0
fi