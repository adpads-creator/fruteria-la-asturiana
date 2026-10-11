# fruteria-la-asturiana
Web de Frutería La Asturiana (Granada), de Pablo y Andrea, y su CICD.

- `web/`: React + Vite. Carruseles, temporada interactiva y contacto. Las fotos de la tienda se añaden en `web/src/assets/tienda/` (jpg, png o webp); la sección "La tienda" aparece sola cuando hay fotos.
- `web/src/data/content.js`: textos, teléfonos y dirección. `credits.json`: créditos de las fotos (CC BY-SA, Wikimedia Commons).
- `infra/`: Terraform (S3 privado + CloudFront + rol OIDC). Estado remoto en S3 con bloqueo en DynamoDB.
- `.github/workflows/deploy.yml`: push a `main` con cambios en `web/` -> build, subida a S3 e invalidación de CloudFront.

Desarrollo: `cd web && npm install && npm run dev`.

URL: https://dj2vcg2u6y230.cloudfront.net