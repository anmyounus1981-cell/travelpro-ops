# Pre-deployment tests for the two pending migrations.
# Run before either migration is permanently applied.

param(
  [string]$TestFile = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path

$preparationPath = Join-Path $repoRoot `
  'supabase/migrations/20261006205613_traveller_review_write_enforcement.sql'

$cutoverPath = Join-Path $repoRoot `
  'supabase/migrations/20261007191905_traveller_review_permission_cutover.sql'

$preparationSql = Get-Content -LiteralPath $preparationPath -Raw
$cutoverSql = Get-Content -LiteralPath $cutoverPath -Raw

$compatibilityName = 'review-preparation-compatibility-checks.sql'

$tests = @(
  Get-ChildItem -LiteralPath $PSScriptRoot `
    -Filter 'review-*-checks.sql' -File |
    Sort-Object @{
      Expression = {
        if ($_.Name -eq $compatibilityName) { 0 } else { 1 }
      }
    }, Name
)

if ($TestFile) {
  $tests = @($tests | Where-Object { $_.Name -eq $TestFile })
}

if ($tests.Count -eq 0) {
  throw 'No matching SQL test files found.'
}

$passed = 0

Push-Location $repoRoot

try {
  foreach ($test in $tests) {
    $temporarySql = Join-Path $env:TEMP (
      'travelpro-review-' + [guid]::NewGuid().ToString() + '.sql'
    )

    try {
      $sqlParts = @(
        'BEGIN ISOLATION LEVEL REPEATABLE READ;'
        $preparationSql
      )

      if ($test.Name -ne $compatibilityName) {
        $sqlParts += $cutoverSql
      }

      $sqlParts += Get-Content -LiteralPath $test.FullName -Raw
      $sqlParts += 'ROLLBACK;'

      $sqlParts -join "`n" |
        Set-Content -LiteralPath $temporarySql -Encoding utf8

      Write-Host "Running: $($test.Name)"

      & npx --yes supabase@2.119.0 db query `
        --linked --file $temporarySql

      $queryExit = $LASTEXITCODE

      if ($queryExit -ne 0) {
        throw "FAILED: $($test.Name), exit code $queryExit"
      }

      $passed += 1
      Write-Host "PASSED: $($test.Name)"
    }
    finally {
      if (Test-Path -LiteralPath $temporarySql) {
        Remove-Item -LiteralPath $temporarySql
      }
    }
  }

  Write-Host "All $passed selected tests passed."
}
finally {
  Pop-Location
}