param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9-]+$')][string]$GameId,
  [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9_.-]+$')][string]$RepositoryName
)
$ErrorActionPreference='Stop'
$source="Jolly-Panda-Works/$RepositoryName"
$builder='Jolly-Panda-Works/game-builds'
$registry=Join-Path (Split-Path $PSScriptRoot -Parent) 'games.json'
$games=@(Get-Content -LiteralPath $registry -Raw | ConvertFrom-Json)
if ($games | Where-Object { $_.id -eq $GameId -and $_.repository -ne $source }) { throw 'Game id already belongs to another repository' }
if ($games | Where-Object { $_.repository -eq $source -and $_.id -ne $GameId }) { throw 'Repository already registered with another game id' }
gh api "repos/$source/branches/Iranian-store" --silent
if ($LASTEXITCODE) { throw 'Create the Iranian-store branch first' }
gh repo edit $source --add-topic tgbot --add-topic android
if ($LASTEXITCODE) { throw 'Topic setup failed' }
gh variable set BUILD_MODE --repo $source --body central
if ($LASTEXITCODE) { throw 'Source build mode setup failed' }
gh api --method PUT "repos/$builder/environments/$GameId" --silent
if ($LASTEXITCODE) { throw 'Environment setup failed' }
if (-not ($games | Where-Object { $_.id -eq $GameId })) {
  $games += [PSCustomObject]@{id=$GameId;repository=$source;branch='Iranian-store';enabled=$true}
}
$json=ConvertTo-Json -InputObject @($games) -Depth 5
[IO.File]::WriteAllText($registry,$json+[Environment]::NewLine,(New-Object System.Text.UTF8Encoding($false)))
Write-Output "Registered $source locally. Allow this repository in the GitHub App installation, add its signing secrets to environment '$GameId', then commit and push games.json."
