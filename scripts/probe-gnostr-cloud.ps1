param(
  [string]$Repo = "a684e920e475ae9535a26256a3fccf0f0e67650156ea6542bc0baab983e7c1ca/tellus",
  [string]$Provider = "d0b51eaeb289cda95c969f9a70ee76c15c4fa084a055037919beef5613ef1caf"
)

$ErrorActionPreference = "Stop"

$owner, $slug = $Repo.Split("/", 2)
if (-not $owner -or -not $slug) {
  throw "Repo must be canonical owner/slug, got '$Repo'"
}

$cloudUrl = "gnostr-cloud://$owner/$slug" + "?provider=$Provider"
$npubUrl = "gnostr://npub156zwjg8ywkhf2ddzvft28lx0pu8xwegp2m4x2s4upw4tnql8c89q7ul7df/$slug"
$nostrUrl = "nostr://npub156zwjg8ywkhf2ddzvft28lx0pu8xwegp2m4x2s4upw4tnql8c89q7ul7df/$slug"

Write-Host "== helpers on PATH =="
foreach ($cmd in @("git-remote-gnostr-cloud", "git-remote-gnostr", "git-remote-nostr", "gnostr")) {
  $found = Get-Command $cmd -ErrorAction SilentlyContinue
  if ($found) {
    Write-Host "$cmd -> $($found.Source)"
  } else {
    Write-Host "$cmd -> missing"
  }
}

Write-Host ""
Write-Host "== Uranus repo inventory =="
$repos = Invoke-RestMethod -Uri "https://uranus.gnostr.cloud/api/repos"
$match = $repos.repos | Where-Object { $_.canonical -eq $Repo } | Select-Object -First 1
if ($match) {
  $match | Select-Object canonical, default_branch, head_commit, is_private | Format-List
} else {
  Write-Host "Repo '$Repo' not visible in /api/repos"
}

Write-Host ""
Write-Host "== git ls-remote probes =="
foreach ($url in @($cloudUrl, $npubUrl, $nostrUrl)) {
  Write-Host ""
  Write-Host $url
  git ls-remote $url
  Write-Host "exit=$LASTEXITCODE"
}
