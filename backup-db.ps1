$pgDump = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"

$connection = "postgresql://postgres.xhjwxejxumodccdimpga:kapostolos1-estia2026@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require"

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$file = "backups/estia_$timestamp.dump"

& $pgDump -Fc $connection -f $file

Write-Host "✅ Backup created: $file"