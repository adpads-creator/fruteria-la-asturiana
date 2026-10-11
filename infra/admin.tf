locals {
  site_url = "https://${aws_cloudfront_distribution.site.domain_name}"
}

resource "aws_cognito_user_pool" "admin" {
  name                     = "${var.project}-admin"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"
  deletion_protection      = "ACTIVE"

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  admin_create_user_config {
    allow_admin_create_user_only = true
    invite_message_template {
      email_subject = "Acceso al panel de Frutería La Asturiana"
      email_message = "Hola. Te han dado acceso al panel para gestionar las fotos de la web: ${local.site_url}/admin.html\n\nUsuario: {username}\nContraseña temporal: {####}\n\nLa contraseña temporal caduca en 7 días."
      sms_message   = "Usuario {username}, contraseña temporal {####}"
    }
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }
}

resource "aws_cognito_user_pool_client" "admin" {
  name                          = "web"
  user_pool_id                  = aws_cognito_user_pool.admin.id
  generate_secret               = false
  explicit_auth_flows           = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors = "ENABLED"
  id_token_validity             = 60
  access_token_validity         = 60
  refresh_token_validity        = 30

  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "days"
  }
}

data "archive_file" "admin_api" {
  type        = "zip"
  source_file = "${path.module}/lambda/index.mjs"
  output_path = "${path.module}/.build/admin-api.zip"
}

resource "aws_cloudwatch_log_group" "admin_api" {
  name              = "/aws/lambda/${var.project}-admin-api"
  retention_in_days = 30
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "admin_api" {
  name               = "${var.project}-admin-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

data "aws_iam_policy_document" "admin_api" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.admin_api.arn}:*"]
  }
  statement {
    actions = ["s3:GetObject", "s3:PutObject"]
    resources = [
      "${aws_s3_bucket.site.arn}/gallery.json",
      "${aws_s3_bucket.site.arn}/gallery/*",
    ]
  }
  statement {
    actions   = ["s3:DeleteObject"]
    resources = ["${aws_s3_bucket.site.arn}/gallery/*"]
  }
  statement {
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.site.arn]
  }
  statement {
    actions   = ["cognito-idp:ListUsers", "cognito-idp:AdminCreateUser", "cognito-idp:AdminDeleteUser"]
    resources = [aws_cognito_user_pool.admin.arn]
  }
}

resource "aws_iam_role_policy" "admin_api" {
  role   = aws_iam_role.admin_api.id
  policy = data.aws_iam_policy_document.admin_api.json
}

resource "aws_lambda_function" "admin_api" {
  function_name    = "${var.project}-admin-api"
  role             = aws_iam_role.admin_api.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  filename         = data.archive_file.admin_api.output_path
  source_code_hash = data.archive_file.admin_api.output_base64sha256
  memory_size      = 256
  timeout          = 15

  environment {
    variables = {
      BUCKET          = aws_s3_bucket.site.id
      DISTRIBUTION_ID = aws_cloudfront_distribution.site.id
      USER_POOL_ID    = aws_cognito_user_pool.admin.id
    }
  }

  depends_on = [aws_cloudwatch_log_group.admin_api, aws_iam_role_policy.admin_api]
}

resource "aws_apigatewayv2_api" "admin" {
  name          = "${var.project}-admin"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = [local.site_url]
    allow_methods = ["GET", "POST", "DELETE", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.admin.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.admin.id]
    issuer   = "https://${aws_cognito_user_pool.admin.endpoint}"
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.admin.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.admin_api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "routes" {
  for_each = toset([
    "POST /photos",
    "DELETE /photos/{id}",
    "GET /users",
    "POST /users",
    "DELETE /users/{username}",
  ])
  api_id             = aws_apigatewayv2_api.admin.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.admin.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 10
    throttling_rate_limit  = 5
  }
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.admin_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.admin.execution_arn}/*/*"
}

# Estos objetos los modifica la Lambda y el panel; Terraform solo los crea.
resource "aws_s3_object" "gallery" {
  bucket        = aws_s3_bucket.site.id
  key           = "gallery.json"
  content       = "[]"
  content_type  = "application/json"
  cache_control = "no-cache"

  lifecycle {
    ignore_changes = [content, etag]
  }
}

resource "aws_s3_object" "admin_config" {
  bucket        = aws_s3_bucket.site.id
  key           = "admin-config.json"
  content_type  = "application/json"
  cache_control = "no-cache"
  content = jsonencode({
    region     = "eu-west-1"
    userPoolId = aws_cognito_user_pool.admin.id
    clientId   = aws_cognito_user_pool_client.admin.id
    apiUrl     = aws_apigatewayv2_api.admin.api_endpoint
  })
}

output "admin_url" {
  value = "${local.site_url}/admin.html"
}

output "user_pool_id" {
  value = aws_cognito_user_pool.admin.id
}

output "client_id" {
  value = aws_cognito_user_pool_client.admin.id
}

output "api_url" {
  value = aws_apigatewayv2_api.admin.api_endpoint
}
