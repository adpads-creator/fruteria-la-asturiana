# fruteria-la-asturiana
Web de Frutería La Asturiana (Granada), de Pablo y Andrea, y su CICD.

- `web/`: React + Vite. Carruseles, temporada interactiva y contacto. La sección "La tienda" se alimenta de `gallery.json` (en S3) y aparece sola cuando hay fotos.
- `web/src/data/content.js`: textos, teléfonos y dirección. `credits.json`: créditos de las fotos (CC BY-SA, Wikimedia Commons).
- `web/admin.html` + `web/src/admin/`: panel `/admin.html` para subir/borrar fotos e invitar usuarios (login con Cognito).
- `infra/lambda/`: API del panel (Lambda + API Gateway HTTP con JWT de Cognito). Las fotos subidas viven en `gallery/` y `gallery.json` del bucket; el deploy no las borra.
- `infra/`: Terraform (S3 privado + CloudFront + rol OIDC). Estado remoto en S3 con bloqueo en DynamoDB.
- `.github/workflows/deploy.yml`: push a `main` con cambios en `web/` -> build, subida a S3 e invalidación de CloudFront.

Desarrollo: `cd web && npm install && npm run dev`.

URL: https://dj2vcg2u6y230.cloudfront.net