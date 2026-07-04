# Design: Username-based admin login (replace email)

- **Date:** 2026-07-04
- **Branch:** `feat/username-login`
- **Status:** approved (design gate passed)

## Goal

Admin users sign in with a **username + password** instead of email + password.
Email is removed from admin accounts entirely — the `User.email` column is dropped.

This only affects **admin accounts** (`User`). It is unrelated to lead/contact emails
(`FormSubmission.email`), which stay as they are.

## Approved decisions

- **Replace, don't add:** drop `User.email`, add `User.username`.
- **Backfill:** existing users' usernames come from the email local-part (before `@`),
  lowercased: `admin@signex.local → admin`, `ealflm@gmail.com → ealflm`.
- **Username rules:** `^[a-z0-9._-]{3,30}$`, stored lowercased, login is
  case-insensitive. **Immutable after creation** (changing a username is out of scope,
  exactly as email was un-editable before).

## Change surface

### 1. DB — `packages/db`
- `schema.prisma` `User`: remove `email String @unique`; add `username String @unique`.
- New migration `username_login` (data-safe ordering):
  1. `ADD COLUMN "username" TEXT` (nullable).
  2. Backfill `UPDATE "User" SET "username" = lower(split_part("email", '@', 1));`
  3. `ALTER COLUMN "username" SET NOT NULL`.
  4. `CREATE UNIQUE INDEX "User_username_key"`.
  5. Drop `User_email_key` + `DROP COLUMN "email"`.
- Assumes derived usernames are unique (true for the 2 current rows). A collision aborts
  the migration — acceptable, and surfaced loudly rather than silently mangled.

### 2. Shared — `packages/shared/src/auth.ts`
- Add `usernameSchema` (trim + lowercase + `regex(/^[a-z0-9._-]{3,30}$/)`).
- `loginSchema`: `{ username: usernameSchema, password: z.string().min(1) }`.
- `createUserSchema`: `{ username: usernameSchema, name, password: min(8), role }`.

### 3. API — `apps/api`
- `auth.service.login(username, password)`: `findUnique({ where: { username } })`;
  keep the constant-time "verify even when user missing" path.
- `auth.controller`: read `body.username`.
- `auth.types`: `AuthedUser.email → username`; `publicUser` / `publicUserRow` map username.
- `seed-config`: `SeedAdminConfig.email → username`; read `SEED_ADMIN_USERNAME`
  (validate against `usernameSchema`); keep the password-length check.
- `seed.service`: upsert sets `username`; log line uses username.
- `users.service.create` / `users.controller`: create by username; P2002 →
  `"Username already in use"`.
- **`importer.service`**: look up the system actor by `{ id: SYSTEM_USER_ID }` instead of
  by `SEED_ADMIN_EMAIL` (removes the env dependency + its guard — cleaner and email-free).
- `main.ts` / `seed.ts`: log messages use `cfg.username`.

### 4. Admin — `apps/admin`
- Login page + form: "Email" field → "Username" (plain text input; drop `type=email`
  and email validation).
- `admin-api/auth/login` route handler + login server action: forward `username`.
- `lib/session`: `SessionUser.email → username`.
- `(dash)/layout` Topbar: `email` prop → `username`; user-menu / topbar renders
  "signed in as **{username}**".
- `users/actions.createUser`: read `fd.get("username")`.
- `user-invite-dialog`: Email field → Username field.
- `users/page`: show username (was email); avatar initials derive from name/username.

### 5. Config
- `.env`: `SEED_ADMIN_EMAIL` → `SEED_ADMIN_USERNAME=admin` (remove the old key).
- `docker-compose.yml` (api service): same rename.

### 6. Tests (TDD — red first, then implement)
- **shared:** `usernameSchema` valid/invalid cases; login/create schema shape.
- **api:** `auth.service.spec`, `auth.controller.spec`, `users.service.spec`,
  `users.controller.spec`, `auth.types.spec`, `seed.service.spec` — fixtures switch to
  `username`.
- **e2e:** `helpers/login.ts` creates throwaway users with a `username` and its cleanup
  keys on a **username marker** (e.g. `username startsWith "e2e"`) instead of the old
  `email endsWith ".test"` — must never match `admin` / `ealflm`. Update
  `auth.e2e-spec`, `users.e2e-spec`.
- **Verify:** full api unit suite + e2e green; admin `next build` green; **live login as
  `admin` and `ealflm`** through the running stack.

## Out of scope
- Changing a username after creation (immutable).
- Password change / reset (separate feature).
- Keeping email as an optional contact field (explicitly dropped per approval).

## Risks
- **Dropping `email` is irreversible** — the two admin emails are lost after migration
  (usernames are derived first, so login is unaffected). Accepted.
- e2e cleanup must be re-keyed to a username marker so it still only deletes throwaway
  test users and never the real `admin` / `ealflm` rows.
