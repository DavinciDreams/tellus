# Gnostr Cloud setup notes

These notes document the current Tellus Gnostr Cloud deployment path without
recording Nostr private keys. Do not paste or commit an `nsec`; use the stored
local identity flow when authentication is required.

## Current live surfaces

- Primary Gnostr app host: <https://tellus.gnostr.cloud/>
- Alternate public host: <https://tellus.garden/>
- Build wall: <https://uranus.gnostr.cloud/wall>
- Repo source browser:
  <https://uranus.gnostr.cloud/source?repo=a684e920e475ae9535a26256a3fccf0f0e67650156ea6542bc0baab983e7c1ca%2Ftellus>

Both app hosts returned `HTTP 200` when checked on 2026-07-12.

## Local remote

The working Gnostr remote in this checkout is `gnostr-tellus`:

```text
gnostr-cloud://info@monumentalsystems.com/tellus?provider=d0b51eaeb289cda95c969f9a70ee76c15c4fa084a055037919beef5613ef1caf
```

Check it with:

```powershell
git remote -v
git ls-remote --heads --tags gnostr-tellus
```

As of 2026-07-12, the verified remote refs were:

```text
refs/heads/master 237f9e53a6293526ea15038843e57119332e9dbd
refs/heads/main   6d4fba2b5f0572412dd2f3d141251befd93bfc9d
refs/tags/v0.8.163 237f9e53a6293526ea15038843e57119332e9dbd
```

The helper may print an endpoint-close warning after a successful ref listing or
push. Treat the ref output as authoritative and re-run `git ls-remote` when in
doubt.

## Auth convention

Use the stored identity name for pushes:

```powershell
$env:GIT_NOSTR_IDENTITY = "lisa"
```

Do not put the private key in shell history, scripts, docs, or chat. If the
helper reports that no credential is available, set the identity environment
variable and retry.

## Deploy convention

`master` is the deploy branch on Gnostr Cloud. Release deploys are triggered by
pushing a `v*` tag after `master` points at the desired commit.

Typical deploy flow:

```powershell
bun run build
git push origin HEAD:main
$env:GIT_NOSTR_IDENTITY = "lisa"
git push gnostr-tellus HEAD:master
git tag v0.8.164
git push gnostr-tellus v0.8.164
git ls-remote --heads --tags gnostr-tellus
```

Use the next unused version tag. If a deploy looks stale, compare the desired
commit with `gnostr-tellus/master` and the latest `v*` tag before assuming the
app bundle is wrong.

## Helper install check

Git can only use custom URL schemes when a matching remote helper is on `PATH`.
On Windows, Cargo usually installs helpers into `%USERPROFILE%\.cargo\bin`.

Check local helper availability:

```powershell
where.exe git-remote-gnostr-cloud
where.exe git-remote-gnostr
where.exe git-remote-nostr
where.exe gnostr
```

If those are missing, install Rust/Cargo first, then install the Gnostr tool
suite:

```powershell
cargo install gnostr --locked
```

Make sure this directory is on `PATH`:

```powershell
$env:USERPROFILE + "\.cargo\bin"
```

## Legacy remotes

This checkout may still contain older `saturn`, `saturn-gnostr`, and
`saturn-npub` remotes. They are historical examples and do not deploy Tellus.
Use `gnostr-tellus` for Tellus deploy verification and pushes.
