#!/usr/bin/env bash
# rebake-mobile.sh — reconstruye y re-publica las apps móviles con UN comando.
#
# Captura todo lo aprendido en la puesta a punto de iOS + Android (jul-2026):
#   - se hornea desde el CLON standalone, nunca desde el worktree anidado
#   - valida el bundle con `expo export` ANTES de encolar (cola gratis pero lenta)
#   - iOS usa credenciales LOCALES (dist.p12 + perfil) que viven fuera del repo
#   - iOS se auto-envía a TestFlight tras compilar (--auto-submit)
#   - Android produce un APK de distribución interna (link para los chefs Android)
#
# Requisitos (ya cumplidos en esta máquina):
#   - clon de horneado en $BAKE con git remoto a origin
#   - secretos iOS en $SECRETS (dist.p12, atelier.mobileprovision, .p8) — NO en el repo
#   - credentials.json + certs/ colocados en $BAKE/apps/mobile (los repone este script)
#   - login EAS hecho (npx eas-cli whoami == andygome)
#
# Uso:
#   bash scripts/rebake-mobile.sh            # ambas plataformas
#   bash scripts/rebake-mobile.sh ios        # solo iOS
#   bash scripts/rebake-mobile.sh android    # solo Android
set -euo pipefail

BAKE="/c/Users/Utente/atelier-bake"
SECRETS="/c/Users/Utente/Desktop/atelier-secretos"
TARGET="${1:-both}"

echo "==> 1/4  Sincronizando el clon de horneado con origin/main"
git -C "$BAKE" fetch origin --quiet
git -C "$BAKE" checkout main --quiet
git -C "$BAKE" merge --ff-only origin/main --quiet
echo "    $BAKE @ $(git -C "$BAKE" log --oneline -1)"

echo "==> 2/4  Instalando dependencias"
pnpm -C "$BAKE" install --frozen-lockfile >/dev/null

echo "==> 3/4  Reponiendo credenciales locales iOS (gitignoreadas, se copian desde $SECRETS)"
mkdir -p "$BAKE/apps/mobile/certs"
cp "$SECRETS/dist.p12" "$SECRETS/atelier.mobileprovision" "$BAKE/apps/mobile/certs/"
# credentials.json apunta a certs/ con ruta relativa; se recrea por si el clon se limpió
cat > "$BAKE/apps/mobile/credentials.json" <<'JSON'
{
  "ios": {
    "provisioningProfilePath": "certs/atelier.mobileprovision",
    "distributionCertificate": { "path": "certs/dist.p12", "password": "atelier-dist-2026" }
  }
}
JSON

cd "$BAKE/apps/mobile"

if [ "$TARGET" = "ios" ] || [ "$TARGET" = "both" ]; then
  echo "==> 4/4  iOS — validando bundle antes de encolar"
  npx expo export --platform ios >/dev/null
  echo "         iOS — build + auto-submit a TestFlight (grupo Chefs / link público)"
  npx eas-cli build --platform ios --profile testflight --non-interactive --auto-submit --no-wait
fi

if [ "$TARGET" = "android" ] || [ "$TARGET" = "both" ]; then
  echo "==> 4/4  Android — build APK (distribución interna, link para chefs Android)"
  npx eas-cli build --platform android --profile pilot --non-interactive --no-wait
fi

echo ""
echo "LISTO. Los builds corren en la nube (~10-30 min). Sigue el progreso:"
echo "   iOS:     https://appstoreconnect.apple.com/apps/6792742020/testflight/ios"
echo "   ambos:   npx eas-cli build:list --limit 4    (desde $BAKE/apps/mobile)"
echo "   APK nuevo: build:list te da la Application Archive URL cuando Android termine"
