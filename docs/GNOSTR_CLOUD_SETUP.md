# Gnostr Cloud setup notes

These notes are for wiring a local Git checkout to the Gnostr Cloud/Uranus repo
surface without leaking Nostr private keys into chat, shell history, or docs.

## Verified endpoints

- Landing page/docs: <https://gnostr.cloud/>
- Build wall: <https://uranus.gnostr.cloud/wall>
- Repo inventory: <https://uranus.gnostr.cloud/api/repos>
- Tellus source browser:
  <https://uranus.gnostr.cloud/source?repo=a684e920e475ae9535a26256a3fccf0f0e67650156ea6542bc0baab983e7c1ca%2Ftellus>

The Uranus API currently reports the Tellus repo as:

```text
canonical: a684e920e475ae9535a26256a3fccf0f0e67650156ea6542bc0baab983e7c1ca/tellus
default branch: master
head: 75277f7fdd1eb7e43b42372ba3494c81db29aaa2
```

## Key setup

Use a NIP-07 browser signer such as nos2x to generate or import the Nostr key.
Do not paste the `nsec` private key into chat or commit it to the repo.

When a CLI asks for the private key, prefer an interactive prompt. If the tool
only accepts an argument, paste it directly into that local terminal invocation
and avoid saving it in scripts.

## Helper install check

Git can only clone custom URL schemes when a matching remote helper is on
`PATH`. On Windows, Cargo installs helpers into `%USERPROFILE%\.cargo\bin`.

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

The public landing page shows `cargo install gnostr-cloud-cli`, but as of
2026-06-17 `cargo search gnostr-cloud-cli` did not find a published crate. The
installable package I could verify is `gnostr`.

## Current helper behavior

This checkout already has these helper binaries installed:

```text
git-remote-gnostr-cloud.exe
git-remote-gnostr.exe
git-remote-nostr.exe
gnostr.exe
```

The configured local remotes are older `saturn` examples and point at the slug
`saturn`, not `tellus`:

```text
saturn        gnostr-cloud://a684e920e475ae9535a26256a3fccf0f0e67650156ea6542bc0baab983e7c1ca/saturn?provider=d0b51eaeb289cda95c969f9a70ee76c15c4fa084a055037919beef5613ef1caf
saturn-gnostr gnostr://a684e920e475ae9535a26256a3fccf0f0e67650156ea6542bc0baab983e7c1ca/saturn
saturn-npub   gnostr://npub156zwjg8ywkhf2ddzvft28lx0pu8xwegp2m4x2s4upw4tnql8c89q7ul7df/saturn
```

Testing the corrected Tellus URL with the currently installed
`git-remote-gnostr-cloud` fails before authentication:

```text
git ls-remote "gnostr-cloud://a684e920e475ae9535a26256a3fccf0f0e67650156ea6542bc0baab983e7c1ca/tellus?provider=d0b51eaeb289cda95c969f9a70ee76c15c4fa084a055037919beef5613ef1caf"
warning: gnostr-cloud unexpectedly said: ''
fatal: malformed response in ref list: ok
Invalid gnostr URL: gnostr-cloud://...
```

Testing the older `nostr://` helper reaches Nostr lookup, but does not find repo
events for the Uranus repo coordinates:

```text
git ls-remote "nostr://npub156zwjg8ywkhf2ddzvft28lx0pu8xwegp2m4x2s4upw4tnql8c89q7ul7df/tellus"
nostr: fetching...
Error: no repo events at specified coordinates
```

That means the current blocker is not the Nostr key. It is the local
`gnostr-cloud://` Git helper implementation or URL contract.

## Commands to retry when the helper is updated

Use a separate remote name from the stale `saturn` examples:

```powershell
git remote add gnostr-cloud "gnostr-cloud://a684e920e475ae9535a26256a3fccf0f0e67650156ea6542bc0baab983e7c1ca/tellus?provider=d0b51eaeb289cda95c969f9a70ee76c15c4fa084a055037919beef5613ef1caf"
git ls-remote gnostr-cloud
```

Fresh clone form:

```powershell
git clone "gnostr-cloud://a684e920e475ae9535a26256a3fccf0f0e67650156ea6542bc0baab983e7c1ca/tellus?provider=d0b51eaeb289cda95c969f9a70ee76c15c4fa084a055037919beef5613ef1caf" tellus-gnostr
```

The deploy workflow in this repo is tag-only. A `v*` tag pushed to the working
Gnostr Cloud remote should enqueue the Uranus CI job:

```powershell
git tag v0.8.54
git push gnostr-cloud v0.8.54
```

