# fruteria-la-asturiana
Landing page de Frutería la Asturiana y su CICD.

- `site/`: HTML/CSS estático.
- `infra/`: Terraform (S3 privado + CloudFront + rol OIDC para GitHub Actions). Estado local, no versionado.
- `.github/workflows/deploy.yml`: al hacer push a `main` con cambios en `site/`, sincroniza con S3 e invalida CloudFront.

URL: https://dj2vcg2u6y230.cloudfront.net
