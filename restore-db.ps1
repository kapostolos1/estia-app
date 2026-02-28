param(
  [Parameter(Mandatory=$true)]
  [string]$DumpFile
)

$pgRestore = "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe"

# Σταθερά στοιχεία pooler για ΤΟ ΙΔΙΟ project σου
$user = "postgres.xhjwxejxumodccdimpga"
$host = "aws-1-eu-central-1.pooler.supabase.com"
$port = 5432
$db   = "postgres"

# Ζητάει password κάθε φορά (πιο ασφαλές – δεν το αποθηκεύουμε σε αρχείο)
$pwd = Read-Host "DB password (δεν αποθηκεύεται)" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pwd)
$plain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)

$conn = "postgresql://$user:$plain@$host`:$port/$db?sslmode=require"

if (!(Test-Path $DumpFile)) {
  Write-Host "❌ Δεν βρέθηκε το dump: $DumpFile"
  exit 1
}

Write-Host "⚠️ RESTORE θα επαναφέρει τη βάση στην κατάσταση του dump και θα χαθούν αλλαγές μετά το backup."
Write-Host "✅ Ξεκινάω restore από: $DumpFile"

& $pgRestore `
  -d $conn `
  --clean --if-exists `
  $DumpFile

if ($LASTEXITCODE -eq 0) {
  Write-Host "✅ Restore completed."
} else {
  Write-Host "❌ Restore failed (exit code $LASTEXITCODE)."
  exit $LASTEXITCODE
}