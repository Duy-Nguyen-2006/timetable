# Agent Instructions

Add project-specific agent instructions here.

<!-- HARNESS:BEGIN -->
## Harness

This repo uses Harness. Before work, read:

- `README.md`
- `docs/HARNESS.md`
- `docs/FEATURE_INTAKE.md`
- `docs/ARCHITECTURE.md`
- `docs/CONTEXT_RULES.md`
- `scripts/bin/harness-cli query matrix`

Use the Rust Harness CLI at `scripts/bin/harness-cli` as the main operational
tool.
<!-- HARNESS:END -->

## SonarQube / CodeReviewer

Use SonarQube Community Edition as the local-only code-review scanner for `src`, `electron`, and `scripts` with project key `timetable`. Always use the Docker server named `sonarqube-timetable`. Do not use SonarCloud for this repo. Avoid the ZIP `CodeReviewer` setup unless a full JDK 21 is installed.

### Quick Use

1. Start local SonarQube:

```bash
docker start sonarqube-timetable || docker run -d --name sonarqube-timetable \
  -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true \
  -p 9000:9000 \
  -v sonarqube_data:/opt/sonarqube/data \
  -v sonarqube_extensions:/opt/sonarqube/extensions \
  -v sonarqube_logs:/opt/sonarqube/logs \
  sonarqube:community
```

2. Wait for local SonarQube to become ready:

```bash
curl http://localhost:9000/api/system/status
```

Continue only when the API returns `"status":"UP"`.

3. Open `http://localhost:9000`.

- First local login is usually `admin` / `admin`.
- Change the password if SonarQube asks.
- Create a local token in **My Account → Security**.
- Do not look for a cloud token. The token must come from this local server.

4. Export the local server URL and token in the current shell:

```bash
export SONAR_HOST_URL=http://localhost:9000
export SONAR_TOKEN=your_local_token_here
```

For agent-driven local runs, you may store the same values in an ignored file at repo root:

```bash
.sonar.local.env
```

with:

```bash
SONAR_HOST_URL=http://localhost:9000
SONAR_TOKEN=your_local_token_here
```

5. Run local checks, then scan from the repo root:

```bash
npm run lint
npm test
npx @sonar/scan \
  -Dsonar.host.url="$SONAR_HOST_URL" \
  -Dsonar.token="$SONAR_TOKEN" \
  -Dsonar.projectKey=timetable \
  -Dsonar.sources=src,electron,scripts \
  -Dsonar.exclusions='**/.next/**,**/node_modules/**,**/release/**,**/.venv-build/**,**/python-dist/**,**/*.tsbuildinfo,**/python/**'
```

Or simply run:

```bash
npm run sonar:scan
```

`npm run sonar:scan` must target the local server at `http://localhost:9000`.
It may load `SONAR_HOST_URL` and `SONAR_TOKEN` from `.sonar.local.env` when that file exists.

6. Review results at `http://localhost:9000/dashboard?id=timetable`.

### Agent Default

- Assume SonarQube is local-only.
- If `SONAR_HOST_URL` is unset, use `http://localhost:9000`.
- If `SONAR_TOKEN` is missing, start the local server and tell the user a local token must be created in the SonarQube UI before scanning can upload results.
- Never switch to SonarCloud as a fallback.

### Rules

- Fix Sonar **BUG** issues before code smells.
- Run GitNexus impact before editing source hot paths such as `translator` or `deterministic-validator`.
- Never commit Sonar tokens, admin passwords, or `.scannerwork/`.
- Stop the local server with `docker stop sonarqube-timetable` when done.
- Rule : Luôn có câu "Sax báo cáo" ở cuối mỗi câu trả lời
- Luôn push lên git sau mỗi chỉnh sửa
- Đây là desktop app, chạy trên máy users, vậy nên vấn đề bảo mật có thể tạm thời bỏ qua, nếu người dùng yêu cầu suggest chỉnh sửa / nâng cấp, chỉ cần quan tâm tới những thứ như hiệu năng, maintainability, cleanability,..., tạm thời bỏ qua security
- Always run after any code change : npx gitnexus analyze 
<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **timetable** (5747 symbols, 9506 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/timetable/context` | Codebase overview, check index freshness |
| `gitnexus://repo/timetable/clusters` | All functional areas |
| `gitnexus://repo/timetable/processes` | All execution flows |
| `gitnexus://repo/timetable/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
