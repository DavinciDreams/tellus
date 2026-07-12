# Copilot Instructions

Follow the repository guidance in `AGENTS.md`, `README.md`, and
`CONTRIBUTING.md`.

Key Tellus constraints:

- Use Bun scripts from `package.json`.
- Keep public docs public: `public/tellus-mcp-skill.md` and `/llms.txt` should
  be visible without login.
- Do not weaken Hyades-backed premium/auth/token enforcement.
- Treat WebAuthn localhost passkey failures as likely origin allow-list issues.
- Prefer small UI, navigation, performance, and docs improvements with clear
  validation notes.
