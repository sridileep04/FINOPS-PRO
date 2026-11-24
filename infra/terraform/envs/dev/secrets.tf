resource "random_id" "secret_key" {
  byte_length = 32
}

resource "random_id" "steampipe_token" {
  byte_length = 32
}

resource "random_id" "fernet" {
  byte_length = 32
}

resource "aws_secretsmanager_secret" "app" {
  name                    = "${var.project}/${var.environment}/app"
  description             = "FinOps platform runtime secrets (DB + app crypto)"
  recovery_window_in_days = var.secret_recovery_window_days
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id

  secret_string = jsonencode({
    DB_USER                   = aws_db_instance.postgres.username
    DB_PASSWORD               = random_password.db.result
    DB_NAME                   = aws_db_instance.postgres.db_name
    DB_HOST                   = aws_db_instance.postgres.address
    DB_PORT                   = "5432"
    SECRET_KEY                = random_id.secret_key.hex
    CREDENTIAL_ENCRYPTION_KEY = "${random_id.fernet.b64_url}="
    STEAMPIPE_SERVICE_TOKEN   = random_id.steampipe_token.hex
  })
}

resource "aws_secretsmanager_secret" "llm" {
  name                    = "${var.project}/${var.environment}/llm"
  description             = "LLM provider API key(s)"
  recovery_window_in_days = var.secret_recovery_window_days
}

resource "aws_secretsmanager_secret_version" "llm" {
  secret_id     = aws_secretsmanager_secret.llm.id
  secret_string = jsonencode({ GROQ_API_KEY = "" })

  lifecycle {
    ignore_changes = [secret_string]
  }
}