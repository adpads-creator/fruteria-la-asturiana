# fruteria-la-asturiana
Web de Frutería La Asturiana (Granada), de Pablo y Andrea, y su CICD.

## Estructura
- `web/`: React + Vite. Página pública (`index.html`) y panel (`admin.html`).
  - Carrusel de portada: usa `hero.json` (fotos subidas desde el panel); si está vacío, las fotos de ejemplo de `web/public/img/fruta/` (créditos en `web/src/data/credits.json`).
  - Carrusel "La tienda": usa `gallery.json`; solo aparece si hay fotos.
  - Textos, teléfonos y dirección: `web/src/data/content.js`.
- `infra/`: Terraform. Estado remoto en S3 (`fruteria-la-asturiana-tfstate-985124893669`) con bloqueo en DynamoDB.
  - `main.tf`: S3 privado (versionado, solo TLS) + CloudFront con OAC y cabeceras de seguridad (CSP estricta, HSTS…).
  - `admin.tf`: Cognito (MFA TOTP obligatoria, sin registro público) + API Gateway HTTP con JWT + Lambda (`lambda/index.mjs`).
  - `oidc.tf`: rol de despliegue para GitHub Actions (OIDC, solo `main`, permisos mínimos).
  - `security.tf`: bloqueo de acceso público a S3 en la cuenta, IAM Access Analyzer, CloudTrail y presupuesto mensual con aviso.
- `.github/workflows/deploy.yml`: push a `main` con cambios en `web/` -> build, subida a S3 e invalidación. Nunca borra `gallery/*`, `gallery.json`, `hero.json` ni `admin-config.json`.

## Panel
`/admin.html`. Usuarios por invitación (pestaña Usuarios). El primer acceso pide cambiar la contraseña y configurar una app de verificación (Google/Microsoft Authenticator).

Si alguien pierde el móvil, desde la cuenta de AWS:
`aws cognito-idp admin-set-user-mfa-preference --user-pool-id <id> --username <email> --software-token-mfa-settings Enabled=false` y que vuelva a entrar para configurarlo de nuevo.

## Desarrollo
`cd web && npm install && npm run dev`

URL: https://dj2vcg2u6y230.cloudfront.net