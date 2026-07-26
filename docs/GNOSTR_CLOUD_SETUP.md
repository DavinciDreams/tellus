# Gnostr Cloud production workflow

Tellus production is published through the Gnostr Cloud/Uranus repository and
CI system. The live deployment is available at both:

- <https://tellus.garden/>
- <https://tellus.gnostr.cloud/>

Coolify is an optional self-hosting path; it is not the current Tellus
production deployment.

## Repository and CI seams

- GitHub source: `https://github.com/DavinciDreams/tellus`
- GitHub branch: `master`
- Gnostr remote name: `gnostr-tellus`
- Gnostr branch: `master`
- CI definition: `.gnostr-cloud-ci.yml`
- Release trigger: a fresh `v*` tag on the Gnostr repository
- Runner: `dgx-deploy`
- Kubernetes workload: `deploy/tellus` in namespace `tellus`
- Build wall: <https://uranus.gnostr.cloud/wall>

The CI job builds a multi-architecture image, pushes it to the internal
registry, updates the Kubernetes image, and waits for rollout completion. A
plain branch push does not deploy.

## Local helper and remote

Install the current Gnostr CLI/helper package and confirm that Git can resolve
the custom URL scheme:

```powershell
cargo install gnostr --locked
where.exe git-remote-gnostr-cloud
where.exe gnostr-cloud-cli
```

The working Tellus remote is:

```powershell
git remote add gnostr-tellus "gnostr-cloud://info@monumentalsystems.com/tellus?provider=d0b51eaeb289cda95c969f9a70ee76c15c4fa084a055037919beef5613ef1caf"
git remote get-url gnostr-tellus
```

If the remote already exists, inspect it instead of replacing it blindly.

## Authentication

Never paste or store an `nsec` in the repository, documentation, command
history, or chat. Configure a named identity through the Gnostr CLI and select
it through `GIT_NOSTR_IDENTITY`.

The established operator identity name for this checkout is `lisa`:

```powershell
gnostr-cloud-cli identity list
$env:GIT_NOSTR_IDENTITY = "lisa"
```

Other operators should use their own configured identity name. The variable
contains only the local identity alias, not the private key.

## Release procedure

Start from the exact merged GitHub commit intended for production and choose a
new immutable tag. Never move or reuse a failed release tag.

```powershell
git fetch origin --prune --tags
git status --short
git show -s --format="%H %s" origin/master
git tag --list "v0.8.*" --sort=-version:refname | Select-Object -First 10

bun install --frozen-lockfile
bun run test -- --testTimeout=30000
bun run build

$env:GIT_NOSTR_IDENTITY = "lisa"
git tag -a v0.8.NEXT origin/master -m "Tellus v0.8.NEXT"
git push origin v0.8.NEXT
git push gnostr-tellus origin/master:master
git push gnostr-tellus v0.8.NEXT
```

Replace `v0.8.NEXT` with an unused tag. Keep the branch push before the tag so
the release commit is already reachable as Gnostr `master` when CI observes the
tag.

## Verification

A successful `git push` is only the start of verification.

1. Confirm GitHub and Gnostr refs resolve to the intended commit/tag.
2. Find the tag pipeline on the Uranus build wall or query
   `https://uranus.gnostr.cloud/api/ci/jobs?limit=300`.
3. Require the `build-deploy` job to finish with `status=success` and exit code
   `0`; its log should report a successful Kubernetes rollout.
4. Fetch <https://tellus.garden/> with a cache-busting query and require HTTP
   `200`.
5. Inspect the HTML and loaded `/assets/*` filenames. For a behavior change,
   check that the relevant served bundle contains the new code marker or no
   longer contains the regressed path.
6. Perform a browser smoke test for the user-visible feature when practical.

Bundle filenames may differ from a local build because production configuration
participates in the build. A changed asset name plus feature-specific content is
stronger evidence than comparing filenames alone.

## Troubleshooting

- A helper can print an endpoint-close warning after refs were successfully
  updated. Verify refs and CI directly before classifying the push as failed.
- If CI never starts, confirm the tag exists on the Gnostr remote and matches
  `v*`; a GitHub-only tag does not trigger Uranus.
- If CI succeeds but the old bundle remains live, continue checking the served
  HTML/assets and inspect the rollout rather than reusing the tag.
- If `bun install --frozen-lockfile` reports lockfile changes, run `bun install`,
  review the `bun.lock` diff, commit the intentional lockfile update, and rerun
  the frozen install before tagging.
- If the runner cannot materialize the repository or reports zero ready
  replicas, repair the runner/deployment state and issue a new immutable tag.
