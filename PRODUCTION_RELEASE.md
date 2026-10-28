# Production Release Notes — VZ CRM

## Applied security fixes

- Supplier self-service GET no longer returns warehouses/service-search data before PIN verification.
- Supplier self-service POST returns protected data only after token/PIN authorization.
- PostgreSQL RLS now enforces section/type/city permissions for supplier/buyer/ticket updates and section permissions for tasks/media.
- Insert policies now require the corresponding CRM section permission.
- `app_settings` writes are admin-only; managers remain read-only.
- Browser CRM cache is cleared at authentication bootstrap and logout to prevent cross-account data residue.
- Remote entity synchronization now sends row-level create/update/delete mutations instead of uploading the entire entity snapshot.
- Knowledge links accept only HTTP(S) URLs.
- Supplier self-service rejects oversized POST bodies.
- Vite dev server defaults to localhost instead of listening on all interfaces.
- Vite minimum version raised to 5.4.17.

## Important deployment requirement

The execution environment used for this release build has no DNS/network access to npm, so a fresh `package-lock.json` could not be generated and the dependency tree could not be installed/tested here.

Before the first production deploy, on a networked machine run:

```bash
npm install
npm audit --audit-level=high
npm run lint
npm run typecheck
npm run build
```

Commit the generated `package-lock.json`, then use `npm ci` in CI/Docker.

The product archive is therefore a **security-hardened release candidate**, not a claim that a live production deployment was executed from this sandbox.
