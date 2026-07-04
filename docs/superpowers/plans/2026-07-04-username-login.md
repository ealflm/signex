# Username-based Admin Login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin users sign in with a **username + password** instead of email; the `User.email` column is removed.

**Architecture:** Swap `User.email` → `User.username` (unique) at the DB layer with a data-safe migration that backfills usernames from the email local-part, then thread `username` through the shared zod schemas, the NestJS auth/users/seed/importer code, and the Next admin UI. Email is never used for admin identity again.

**Tech Stack:** Prisma 6 + Postgres 16 (`@signex/db`), zod (`@signex/shared`), NestJS 11 (`apps/api`, Jest + supertest), Next 16 (`apps/admin`, Vitest).

## Global Constraints

- Workspace build order (load-bearing): `@signex/db` and `@signex/shared` must compile to CommonJS `dist/` before `apps/api`/`apps/admin` consume them. After the schema change, regenerate the Prisma client (`npm run -w @signex/db generate`) before building the api.
- Username rule (verbatim): `^[a-z0-9._-]{3,30}$`, stored lowercased, login is case-insensitive. Username is immutable after creation.
- Existing-user backfill (verbatim): `username = lower(split_part(email, '@', 1))` → `admin`, `ealflm`.
- Node `>=18`, npm workspaces + Turborepo. Postgres runs in Docker (host port **3059**).
- End every commit message with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Do NOT touch `FormSubmission.email` (lead/contact email — unrelated).
- The dev DB + running containers will be temporarily broken between Task 1 (migration applied) and Task 8 (stack rebuilt). This is expected.

---

### Task 1: DB — swap `email` → `username` with a data-safe migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (User model)
- Create: `packages/db/prisma/migrations/<ts>_username_login/migration.sql` (via `--create-only`, then hand-edited)
- Check: `packages/db/test/schema.spec.ts` (only if it references `email`)

**Interfaces:**
- Produces: `User { username String @unique }` (no `email`) on the generated Prisma client — every later task consumes `client.user.*` with `username`.

- [ ] **Step 1: Edit the schema**

In `packages/db/prisma/schema.prisma`, in `model User`, replace:
```prisma
  email        String    @unique
```
with:
```prisma
  username     String    @unique
```
(Leave all other fields/relations unchanged.)

- [ ] **Step 2: Scaffold the migration WITHOUT applying it**

Run: `npx -w @signex/db prisma migrate dev --create-only --name username_login`
Expected: creates `packages/db/prisma/migrations/<ts>_username_login/migration.sql` and does NOT apply it. The generated SQL will be destructive (drops email, adds `username NOT NULL` with no backfill) — that is wrong; we replace it next.

- [ ] **Step 3: Replace the migration SQL with the data-safe version**

Overwrite the generated `migration.sql` with exactly:
```sql
-- Add username (nullable first so the backfill can populate it)
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Backfill from the email local-part, lowercased (admin@... -> admin, ealflm@... -> ealflm)
UPDATE "User" SET "username" = lower(split_part("email", '@', 1));

-- Enforce presence + uniqueness now that every row has a value
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- Drop the old email identifier
DROP INDEX "User_email_key";
ALTER TABLE "User" DROP COLUMN "email";
```

- [ ] **Step 4: Apply the migration + regenerate + build**

Run: `npx -w @signex/db prisma migrate dev`
Expected: `Applying migration ...username_login`, then `Your database is now in sync`. No reset prompt.
Then run: `npm run -w @signex/db generate && npm run -w @signex/db build`
Expected: `✔ Generated Prisma Client`, `tsc` exits 0.

- [ ] **Step 5: Verify the swap in the live DB**

Run: `docker exec -e PGPASSWORD=signex signex-postgres psql -U signex -d signex -c 'SELECT username, role, "isActive" FROM "User" ORDER BY "createdAt";'`
Expected: two rows — `admin | ADMIN | t` and `ealflm | EDITOR | t`. No `email` column.

- [ ] **Step 6: Fix the db schema test if needed**

Run: `grep -n "email" packages/db/test/schema.spec.ts`
If it references a `User.email` fixture/assertion, change it to `username` (e.g. `username: 'someone'`). If it only covers Analytics/FormSubmission, leave it.
Run: `npm run test -w @signex/db` → Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/db/test/schema.spec.ts
git commit -m "feat(db): replace User.email with User.username (backfilled from email local-part)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Shared — `usernameSchema` + login/create schemas

**Files:**
- Modify: `packages/shared/src/auth.ts`
- Modify: `packages/shared/src/auth.test.ts`

**Interfaces:**
- Produces: `usernameSchema` (zod), `loginSchema = { username, password }`, `createUserSchema = { username, name, password, role }`. Consumed by api auth/users controllers + admin login route/actions.

- [ ] **Step 1: Write failing tests**

In `packages/shared/src/auth.test.ts`, add:
```ts
import { usernameSchema, loginSchema, createUserSchema } from "./auth";

describe("usernameSchema", () => {
  it("accepts a valid lowercase handle", () => {
    expect(usernameSchema.parse("ealflm")).toBe("ealflm");
  });
  it("lowercases + trims input", () => {
    expect(usernameSchema.parse("  Admin  ")).toBe("admin");
  });
  it("rejects too-short (<3)", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
  });
  it("rejects illegal characters (spaces, @)", () => {
    expect(usernameSchema.safeParse("a b").success).toBe(false);
    expect(usernameSchema.safeParse("a@b").success).toBe(false);
  });
  it("loginSchema takes username + password", () => {
    expect(loginSchema.parse({ username: "Admin", password: "x" })).toEqual({
      username: "admin",
      password: "x",
    });
  });
  it("createUserSchema takes username (no email)", () => {
    const out = createUserSchema.parse({
      username: "newbie",
      name: "New",
      password: "pw123456",
      role: "EDITOR",
    });
    expect(out.username).toBe("newbie");
    expect("email" in out).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm run test -w @signex/shared -- auth`
Expected: FAIL — `usernameSchema` is not exported / `loginSchema` still requires `email`.

- [ ] **Step 3: Implement**

In `packages/shared/src/auth.ts`, replace the `loginSchema` and `createUserSchema` blocks with:
```ts
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, "3-30 chars: letters, digits, . _ -");

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  username: usernameSchema,
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(ROLE_NAMES).default("EDITOR"),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;
```

- [ ] **Step 4: Run — verify PASS + rebuild dist**

Run: `npm run test -w @signex/shared -- auth` → Expected: PASS.
Run: `npm run build -w @signex/shared` → Expected: `tsc` exits 0 (api consumes `dist/`).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/auth.ts packages/shared/src/auth.test.ts
git commit -m "feat(shared): usernameSchema + username-based login/create schemas

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: API auth — login by username

**Files:**
- Modify: `apps/api/src/auth/auth.types.ts` (`AuthedUser.email` → `username`; `publicUser`/`publicUserRow`)
- Modify: `apps/api/src/auth/auth.service.ts` (`login(username, ...)`)
- Modify: `apps/api/src/auth/auth.controller.ts` (`LoginBody.username`, `body.username`)
- Modify: `apps/api/src/auth/auth.types.spec.ts`, `auth.service.spec.ts`, `auth.controller.spec.ts`

**Interfaces:**
- Consumes: `client.user.username` (Task 1), `loginSchema` (Task 2).
- Produces: `AuthService.login(username: string, password: string, ctx?)`, `AuthedUser { username: string }`, `publicUser(u).username`.

- [ ] **Step 1: Update the type + service tests to username (RED)**

In `apps/api/src/auth/auth.types.spec.ts`, `auth.service.spec.ts`, `auth.controller.spec.ts`: in every `User`/`AuthedUser` fixture replace `email: 'x@y.com'` with `username: 'someuser'`, and any assertion on `.email` with `.username`. In `auth.service.spec.ts`, change the login call/`findUnique` expectation from `{ where: { email } }` to `{ where: { username } }` and pass a `username` arg. In `auth.controller.spec.ts`, change the login body to `{ username: 'admin', password: 'pw' }` and assert `auth.login` is called with the username.

- [ ] **Step 2: Run — verify FAIL**

Run: `npm run test -w @signex/api -- auth.types auth.service auth.controller`
Expected: FAIL — fixtures/impl still use `email`.

- [ ] **Step 3: Implement `auth.types.ts`**

Replace `email` with `username` throughout:
```ts
export interface AuthedUser {
  id: string;
  username: string;
  name: string;
  role: RoleName;
  isActive: boolean;
}
```
and in `publicUser` / `publicUserRow`, replace `email: u.email,` with `username: u.username,`.

- [ ] **Step 4: Implement `auth.service.ts`**

Change the `login` signature + lookup:
```ts
async login(
  username: string,
  password: string,
  ctx?: { ip?: string; userAgent?: string },
): Promise<{ user: AuthedUser; rawToken: string; expiresAt: Date }> {
  const user = await this.prisma.client.user.findUnique({
    where: { username },
  });
```
(Leave the constant-time `verifyPassword` fallback + the rest unchanged.)

- [ ] **Step 5: Implement `auth.controller.ts`**

Replace the `LoginBody` interface + the `login` call:
```ts
interface LoginBody {
  username: string;
  password: string;
}
```
and change `this.auth.login(body.email, ...)` → `this.auth.login(body.username, ...)`.

- [ ] **Step 6: Run — verify PASS**

Run: `npm run test -w @signex/api -- auth.types auth.service auth.controller`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth/auth.types.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.controller.ts apps/api/src/auth/auth.types.spec.ts apps/api/src/auth/auth.service.spec.ts apps/api/src/auth/auth.controller.spec.ts
git commit -m "feat(api): authenticate by username instead of email

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: API seed + importer + config — `SEED_ADMIN_USERNAME`

**Files:**
- Modify: `apps/api/src/auth/seed-config.ts` (`SeedAdminConfig.username`, read `SEED_ADMIN_USERNAME`)
- Modify: `apps/api/src/auth/seed.service.ts` (upsert `username`)
- Modify: `apps/api/src/importer/importer.service.ts` (look up system actor by `id: SYSTEM_USER_ID`)
- Modify: `apps/api/src/main.ts`, `apps/api/src/auth/seed.ts` (log messages: `cfg.username`)
- Modify: `.env`, `docker-compose.yml`
- Modify: `apps/api/src/auth/seed-config.spec.ts`, `seed.service.spec.ts`

**Interfaces:**
- Consumes: `usernameSchema` (Task 2), `SYSTEM_USER_ID` (existing constant).
- Produces: `SeedAdminConfig { username, name, password }`; seed admin row has `username` from `SEED_ADMIN_USERNAME`.

- [ ] **Step 1: Update seed tests to username (RED)**

In `seed-config.spec.ts`: replace `SEED_ADMIN_EMAIL` env keys/assertions with `SEED_ADMIN_USERNAME` (valid value e.g. `'admin'`; add an invalid-username case that throws). In `seed.service.spec.ts`: replace `email:` fixture with `username:` and assert the upsert `create`/`update` data contains `username`.

- [ ] **Step 2: Run — verify FAIL**

Run: `npm run test -w @signex/api -- seed-config seed.service`
Expected: FAIL — config/service still read/write `email`.

- [ ] **Step 3: Implement `seed-config.ts`**

Replace the `email` field + read with `username`, validated by the shared schema:
```ts
import { usernameSchema } from '@signex/shared';
// ...
export interface SeedAdminConfig {
  username: string;
  name: string;
  password: string;
}
// inside readSeedAdminConfig:
const username = usernameSchema.parse(required(env, 'SEED_ADMIN_USERNAME'));
const name = required(env, 'SEED_ADMIN_NAME');
const password = required(env, 'SEED_ADMIN_PASSWORD');
// ...(password length check unchanged)...
return { username, name, password };
```
(`usernameSchema.parse` throws on an invalid handle — satisfies the RED case.)

- [ ] **Step 4: Implement `seed.service.ts`**

In `seedAdmin`, change the `fields` object `email: cfg.email,` → `username: cfg.username,`, and the log line `${cfg.email}` → `${cfg.username}`.

- [ ] **Step 5: Implement `importer.service.ts`**

Replace the `SEED_ADMIN_EMAIL` lookup with the deterministic id. Change:
```ts
// remove the SEED_ADMIN_EMAIL guard + `where: { email: actorEmail }`
import { SYSTEM_USER_ID } from '../auth/seed-config';
// ...
const actor = await this.prisma.client.user.findUnique({
  where: { id: SYSTEM_USER_ID },
});
if (!actor) {
  throw new Error('importer: system admin not found — run auth:seed first');
}
```
(Delete the now-unused `actorEmail`/`SEED_ADMIN_EMAIL` reads.)

- [ ] **Step 6: Implement log lines in `main.ts` + `seed.ts`**

Replace `${cfg.email}` with `${cfg.username}` in both log strings.

- [ ] **Step 7: Update config**

In `.env`: replace `SEED_ADMIN_EMAIL=admin@signex.local` with `SEED_ADMIN_USERNAME=admin`.
In `docker-compose.yml` (api service `environment:`): replace the `SEED_ADMIN_EMAIL: ${SEED_ADMIN_EMAIL:-admin@signex.local}` line with `SEED_ADMIN_USERNAME: ${SEED_ADMIN_USERNAME:-admin}`.

- [ ] **Step 8: Run — verify PASS**

Run: `npm run test -w @signex/api -- seed-config seed.service`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/auth/seed-config.ts apps/api/src/auth/seed.service.ts apps/api/src/importer/importer.service.ts apps/api/src/main.ts apps/api/src/auth/seed.ts apps/api/src/auth/seed-config.spec.ts apps/api/src/auth/seed.service.spec.ts .env docker-compose.yml
git commit -m "feat(api): seed admin by SEED_ADMIN_USERNAME; importer resolves actor by id

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: API users — create by username

**Files:**
- Modify: `apps/api/src/users/users.service.ts` (create `username`)
- Modify: `apps/api/src/users/users.controller.ts` (`CreateBody.username`)
- Modify: `apps/api/src/users/users.service.spec.ts`, `users.controller.spec.ts`

**Interfaces:**
- Consumes: `createUserSchema` (Task 2), `client.user.create({ data: { username } })`.
- Produces: create endpoint keyed on username; duplicate → `ConflictException('Username already in use')`.

- [ ] **Step 1: Update create tests to username (RED)**

In `users.service.spec.ts`: the `create` test's input `{ email: 'new@b.com', ... }` → `{ username: 'newbie', ... }`; assert returned `.username` and that `create` was called with `data.username`. Keep the P2002 test but expect message `'Username already in use'`. In `users.controller.spec.ts`: the `POST /` delegation body `{ email, ... }` → `{ username: 'newbie', ... }`; fixtures that assert `.email` → `.username`.

- [ ] **Step 2: Run — verify FAIL**

Run: `npm run test -w @signex/api -- users.service users.controller`
Expected: FAIL — create still uses `email`.

- [ ] **Step 3: Implement `users.service.ts`**

In `CreateUserInput` change `email` → `username`; in `create`, `data: { email: dto.email, ... }` → `data: { username: dto.username, ... }`; change the P2002 message to `'Username already in use'`.

- [ ] **Step 4: Implement `users.controller.ts`**

In the `CreateBody` interface, `email: string;` → `username: string;`. (The `@Body(new ZodValidationPipe(createUserSchema))` already validates username via Task 2.)

- [ ] **Step 5: Run — verify PASS**

Run: `npm run test -w @signex/api -- users.service users.controller`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/users.controller.ts apps/api/src/users/users.service.spec.ts apps/api/src/users/users.controller.spec.ts
git commit -m "feat(api): create users by username

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: API — e2e helpers/specs + full green build

**Files:**
- Modify: `apps/api/test/helpers/login.ts` (username-based create + cleanup)
- Modify: `apps/api/test/auth.e2e-spec.ts`, `apps/api/test/users.e2e-spec.ts`
- Grep-check: any remaining `.test` email cleanup / `email` fixtures in `apps/api/test/*.e2e-spec.ts`

**Interfaces:**
- Consumes: the username auth/users stack (Tasks 3-5).
- Produces: e2e users identified by a **username marker** (`e2e...`), cleaned up without ever matching `admin` / `ealflm`.

- [ ] **Step 1: Rewrite `helpers/login.ts` to username**

Replace the email constants + creation + cleanup:
```ts
export const E2E_EDITOR_USERNAME = `e2e-editor-${Date.now()}`;
export const E2E_EDITOR_PASSWORD = 'E2eEditorPass123!';
```
In `loginAsEditor`, `prisma.user.upsert` uses `where: { username: E2E_EDITOR_USERNAME }` and `create: { username: E2E_EDITOR_USERNAME, name: 'E2E Editor', passwordHash, role: 'EDITOR', isActive: true }`; the login POST body → `{ username: E2E_EDITOR_USERNAME, password: E2E_EDITOR_PASSWORD }`.
Rewrite `cleanupEditorUser` to key on the username marker instead of `email endsWith '.test'`:
```ts
const userFilter = { username: { startsWith: 'e2e' } } as const;
await prisma.publishedPointer.deleteMany({ where: { release: { createdBy: userFilter } } });
await prisma.release.deleteMany({ where: { createdBy: userFilter } });
await prisma.session.deleteMany({ where: { user: userFilter } });
await prisma.auditLog.deleteMany({ where: { user: userFilter } });
await prisma.user.deleteMany({ where: userFilter });
```
(`e2e`-prefixed usernames never collide with `admin`/`ealflm`.)

- [ ] **Step 2: Update `auth.e2e-spec.ts` + `users.e2e-spec.ts`**

Replace every `AuthedUser`/login fixture `email: 'x@signex.test'` with `username: 'e2e-...'`; the auth stub's `login` matcher and `validateSessionToken` return an `AuthedUser` with `username`. In `users.e2e-spec.ts`, the throwaway target's `prisma.user.create` uses `username: \`e2e-users-target-${Date.now()}\`` (drop `email`), and the afterAll cleanup keys on `username: { startsWith: 'e2e' }`.

- [ ] **Step 3: Run the e2e suites — verify PASS**

Run: `npm run test:e2e -w @signex/api -- auth users`
Expected: PASS (auth RBAC + users guards) against the migrated dev DB.

- [ ] **Step 4: Full api unit suite + build (regression gate)**

Run: `npm run test -w @signex/api`
Expected: all suites PASS.
Run: `npm run build -w @signex/api`
Expected: `nest build` (tsc) exits 0 with no `email` type errors.
If any file still references `user.email` / `body.email`, fix it (grep: `grep -rn "\.email\b\|email:" apps/api/src | grep -iv formsubmission | grep -v seed-samples`) and re-run.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test
git commit -m "test(api): username-based e2e login helper + specs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Admin UI — username everywhere

**Files:**
- Modify: `apps/admin/app/login/page.tsx`
- Modify: `apps/admin/app/lib/session.ts` (`SessionUser.username`)
- Modify: `apps/admin/app/(dash)/layout.tsx` (Topbar prop)
- Modify: `apps/admin/components/shell/topbar.tsx`, `apps/admin/components/shell/user-menu.tsx`
- Modify: `apps/admin/app/(dash)/users/actions.ts` (createUser reads `username`)
- Modify: `apps/admin/app/(dash)/users/user-invite-dialog.tsx` (Username field)
- Modify: `apps/admin/app/(dash)/users/page.tsx` (display username)
- No change needed: `apps/admin/app/admin-api/auth/login/route.ts` (schema-driven via `loginSchema`)

**Interfaces:**
- Consumes: `GET /api/auth/me` now returns `{ user: { ..., username } }` (Task 3); `loginSchema`/`createUserSchema` username shape (Task 2).

- [ ] **Step 1: `login/page.tsx` — Username field**

Rename the `email`/`setEmail` state to `username`/`setUsername`; change the request body to `{ username, password }`; change the `Field` label to `"Username"`, the `Input` `type="text"`, `id="username"`, `placeholder="admin"`, and its `onChange`/`value` to the username state. Keep `autoComplete="username"`.

- [ ] **Step 2: `lib/session.ts` — SessionUser**

In `interface SessionUser`, `email: string;` → `username: string;`. (`getSession` already returns whatever `/api/auth/me` sends — now `username`.)

- [ ] **Step 3: Topbar + UserMenu + layout**

`(dash)/layout.tsx`: `<Topbar email={user.email} ... />` → `<Topbar username={user.username} ... />`.
`topbar.tsx`: `email: string;` prop → `username: string;` and pass `<UserMenu username={username} role={role} />`.
`user-menu.tsx`: prop `email` → `username`; drop the `@`-splitting in `initials` (operate on the username directly):
```ts
function initials(username: string): string {
  const parts = username.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return username.slice(0, 2).toUpperCase();
}
```
Update the `aria-label` to `signed in as ${username}` and the displayed `{email}` → `{username}`.

- [ ] **Step 4: Users list + invite dialog + action**

`users/page.tsx`: in `interface UserRow`, `email` → `username`; the member cell shows `{u.username}` and `initials(u.name, u.username)`.
`users/user-invite-dialog.tsx`: change the first `Field`/`Input` from Email to Username (`label="Username"`, `id="invite-username"`, `name="username"`, `type="text"`, `placeholder="jdoe"`, remove `inputMode="email"`).
`users/actions.ts`: in `createUser`, `email: String(fd.get("email") ?? "")` → `username: String(fd.get("username") ?? "")`.

- [ ] **Step 5: Typecheck + build**

Run: `npm run test -w @signex/admin` → Expected: existing suites still PASS (no email coupling).
Run: `npm run build -w @signex/admin` → Expected: `✓ Compiled successfully`, TypeScript finished, all routes generated. Fix any remaining `user.email` reference the compiler flags.

- [ ] **Step 6: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): username-based login + user UI (drop email)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Live verification (full stack)

**Files:** none (verification only).

- [ ] **Step 1: Rebuild the stack**

Run: `docker compose up -d --build api admin`
Expected: images rebuilt; `signex-api` + `signex-admin` become healthy. (Postgres already migrated in Task 1; the seed on api boot re-asserts `admin` as an active ADMIN.)

- [ ] **Step 2: Verify login by username (API)**

Run:
```bash
JAR=$(mktemp)
curl -s -c "$JAR" -o /dev/null -w 'login=%{http_code}\n' -X POST http://localhost:3060/api/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"change-me-please-now"}'
TOKEN=$(grep sx_session "$JAR" | awk '{print $7}')
curl -s http://localhost:3060/api/auth/me -H "Authorization: Bearer $TOKEN"
```
Expected: `login=201`, and `/me` returns `{"user":{...,"username":"admin",...}}` (no `email`).

- [ ] **Step 3: Verify old email login is rejected**

Run: `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3060/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin@signex.local","password":"change-me-please-now"}'`
Expected: `422` (fails `usernameSchema` — `@` illegal) — i.e. email is no longer a valid credential.

- [ ] **Step 4: Verify create-by-username + editor login**

With the admin `$TOKEN`, `POST /api/users` `{"username":"probe","name":"Probe","password":"pw123456","role":"EDITOR"}` → Expected `201`. Then login as `ealflm` (Task 1 backfill) and as `probe` → Expected `201` each. Then delete the probe via DB: `docker exec -e PGPASSWORD=signex signex-postgres psql -U signex -d signex -c "DELETE FROM \"User\" WHERE username='probe';"`.

- [ ] **Step 5: Browser smoke (optional but recommended)**

Open `http://localhost:3061/login`, sign in as `admin` / `change-me-please-now`. Expected: reaches the dashboard; the account menu shows "signed in as **admin**". Open `/users`: the roster shows `admin` and `ealflm` (usernames, no emails).

- [ ] **Step 6: Final commit (if any verification fixups were needed)**

Only if Steps 1-5 required changes. Otherwise nothing to commit — the feature is done.
