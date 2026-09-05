# Database

Plain SQL migrations, applied in filename order by `db/migrate.mjs`.

- `npm run migrate` applies whatever is pending; `npm run migrate -- --status` only reports.
- Vercel runs it before `next build` on production deploys, so a merged migration is live before the code that needs it. Preview deploys skip it.
- Add a change as a new `NNN_name.sql` file. Never edit an applied file.
- Keep each migration compatible with the currently deployed code, since it runs a minute before the new build goes live.
