# Inventario de rutas de Atelier — 6 de septiembre de 2026

Inventario estático del checkout local. Cada fila enlaza a su implementación. La presencia de un guard no demuestra por sí sola que todos los permisos o relaciones estén validados; los hallazgos del informe principal revisan esas diferencias.

| Ruta | Métodos exportados | Implementación |
|---|---|---|
| /api/auth/[...nextauth] | GET, POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/auth/[...nextauth]/route.ts>) |
| /api/conversations/[id]/messages/bulk | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/conversations/[id]/messages/bulk/route.ts>) |
| /api/conversations/[id]/messages | GET, POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/conversations/[id]/messages/route.ts>) |
| /api/conversations/[id] | DELETE | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/conversations/[id]/route.ts>) |
| /api/conversations | GET, POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/conversations/route.ts>) |
| /api/cron/recalc-criticality | GET | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/cron/recalc-criticality/route.ts>) |
| /api/debug-sentry | GET | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/debug-sentry/route.ts>) |
| /api/health | GET | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/health/route.ts>) |
| /api/ideas/[id]/conversation | GET | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/ideas/[id]/conversation/route.ts>) |
| /api/ideas/[id] | PATCH, DELETE | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/ideas/[id]/route.ts>) |
| /api/ideas | GET, POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/ideas/route.ts>) |
| /api/me/delete-preflight | GET | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/me/delete-preflight/route.ts>) |
| /api/me/photo | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/me/photo/route.ts>) |
| /api/me | GET, PATCH, DELETE | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/me/route.ts>) |
| /api/menus/[id]/client-override | PATCH | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/menus/[id]/client-override/route.ts>) |
| /api/menus/[id]/duplicate | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/menus/[id]/duplicate/route.ts>) |
| /api/menus/[id]/items/[itemId] | PATCH, DELETE | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/menus/[id]/items/[itemId]/route.ts>) |
| /api/menus/[id]/items/reorder | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/menus/[id]/items/reorder/route.ts>) |
| /api/menus/[id]/items | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/menus/[id]/items/route.ts>) |
| /api/menus/[id]/pdf | GET | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/menus/[id]/pdf/route.ts>) |
| /api/menus/[id]/restore | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/menus/[id]/restore/route.ts>) |
| /api/menus/[id] | GET, PATCH, DELETE | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/menus/[id]/route.ts>) |
| /api/menus/[id]/sections/[sectionId] | PATCH, DELETE | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/menus/[id]/sections/[sectionId]/route.ts>) |
| /api/menus/[id]/sections | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/menus/[id]/sections/route.ts>) |
| /api/menus | GET, POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/menus/route.ts>) |
| /api/mobile/auth/apple/nonce | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/mobile/auth/apple/nonce/route.ts>) |
| /api/mobile/auth/apple | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/mobile/auth/apple/route.ts>) |
| /api/mobile/auth/dev-login | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/mobile/auth/dev-login/route.ts>) |
| /api/mobile/auth/google | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/mobile/auth/google/route.ts>) |
| /api/mobile/auth/request | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/mobile/auth/request/route.ts>) |
| /api/mobile/auth/signout | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/mobile/auth/signout/route.ts>) |
| /api/mobile/auth/verify | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/mobile/auth/verify/route.ts>) |
| /api/products/[id]/duplicate | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/products/[id]/duplicate/route.ts>) |
| /api/products/[id]/history | GET | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/products/[id]/history/route.ts>) |
| /api/products/[id]/restore | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/products/[id]/restore/route.ts>) |
| /api/products/[id] | GET, PATCH, DELETE | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/products/[id]/route.ts>) |
| /api/products/[id]/yield-tests | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/products/[id]/yield-tests/route.ts>) |
| /api/products/export/csv | GET | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/products/export/csv/route.ts>) |
| /api/products/export/pdf | GET | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/products/export/pdf/route.ts>) |
| /api/products/from-raw | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/products/from-raw/route.ts>) |
| /api/products/match | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/products/match/route.ts>) |
| /api/products/migrate-recipes | GET, POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/products/migrate-recipes/route.ts>) |
| /api/products/recalc-criticality | GET, POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/products/recalc-criticality/route.ts>) |
| /api/products | GET, POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/products/route.ts>) |
| /api/recipes/[id]/duplicate | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/recipes/[id]/duplicate/route.ts>) |
| /api/recipes/[id]/pdf | GET | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/recipes/[id]/pdf/route.ts>) |
| /api/recipes/[id]/restore | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/recipes/[id]/restore/route.ts>) |
| /api/recipes/[id] | GET, PATCH, DELETE | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/recipes/[id]/route.ts>) |
| /api/recipes/[id]/scale | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/recipes/[id]/scale/route.ts>) |
| /api/recipes/export/pdf | GET | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/recipes/export/pdf/route.ts>) |
| /api/recipes/extract | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/recipes/extract/route.ts>) |
| /api/recipes/import-gdoc | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/recipes/import-gdoc/route.ts>) |
| /api/recipes | GET, POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/recipes/route.ts>) |
| /api/recipes/upload | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/recipes/upload/route.ts>) |
| /api/restaurant/invite | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/restaurant/invite/route.ts>) |
| /api/restaurant/join | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/restaurant/join/route.ts>) |
| /api/restaurant/leave/preflight | GET | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/restaurant/leave/preflight/route.ts>) |
| /api/restaurant/leave | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/restaurant/leave/route.ts>) |
| /api/restaurant/menu-style/from-image | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/restaurant/menu-style/from-image/route.ts>) |
| /api/restaurant/photo | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/restaurant/photo/route.ts>) |
| /api/restaurant | GET, POST, PATCH | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/restaurant/route.ts>) |
| /api/restaurant/staff/[userId] | PATCH, DELETE | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/restaurant/staff/[userId]/route.ts>) |
| /api/stripe/webhook | POST | [Código](<C:/Users/Utente/Desktop/atelier-2-0/apps/api/app/api/stripe/webhook/route.ts>) |

Total: 63 archivos de ruta; 86 métodos HTTP exportados.
