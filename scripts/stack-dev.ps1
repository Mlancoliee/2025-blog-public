param(
    [ValidateSet('dependencies','check','build','preview','browser')][string]$Task = 'dependencies',
    [string]$BackendArchive,
    [switch]$Scale
)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$config = Join-Path $project '.tmp/stack-docker'
New-Item -ItemType Directory -Force $config | Out-Null
Set-Content (Join-Path $config 'config.json') '{}' -NoNewline
$dockerArgs = @('--config', $config, 'run', '--rm',
    '--mount', "type=bind,src=$project,dst=/workspace",
    '--mount', 'type=volume,src=inkstack-web-modules,dst=/workspace/node_modules',
    '--mount', 'type=volume,src=inkstack-web-next,dst=/workspace/.next',
    '--mount', 'type=volume,src=inkstack-web-npm,dst=/root/.npm',
    '-w', '/workspace', '-e', 'NEXT_TELEMETRY_DISABLED=1')
if ($Task -in @('check','browser')) {
    if (!$BackendArchive) { $BackendArchive = Join-Path (Split-Path $project -Parent) '2025-blog-pb/dist/inkstack-local-linux-amd64.tar.gz' }
    $archive = Get-Item -LiteralPath $BackendArchive
    $dockerArgs += @('--mount', "type=bind,src=$($archive.DirectoryName),dst=/backend-dist,readonly", '-e', "INKSTACK_TEST_ARCHIVE=/backend-dist/$($archive.Name)")
}
if ($Task -eq 'preview') { $dockerArgs += @('-p', '127.0.0.1:2026:2026') }
if ($Scale) { $dockerArgs += @('-e', 'INKSTACK_SCALE=1') }
$image = if ($Task -eq 'browser') { 'mcr.microsoft.com/playwright:v1.51.1-noble' } else { 'node:22-bookworm-slim' }
$dockerArgs += @($image, 'bash', 'scripts/stack-tasks.sh', $Task)
& docker @dockerArgs
if ($LASTEXITCODE -ne 0) { throw "InkStack Docker task '$Task' failed ($LASTEXITCODE)" }
