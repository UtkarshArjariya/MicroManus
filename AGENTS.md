# Repository instructions

## Database migrations

- Apply live Supabase migrations directly with the Supabase CLI; do not ask the user to paste SQL into the Dashboard SQL Editor.
- Keep migration SQL in `supabase/migrations/`, link with `pnpm supabase link --project-ref <project-ref>`, inspect pending changes, then run `pnpm supabase db push`.
- Read current CLI help before relying on remembered flags because Supabase CLI commands can change.
- Supply `SUPABASE_ACCESS_TOKEN` and database credentials through local or session environment variables only. Never write credentials to tracked files or commit them.
- Verify the resulting live schema after each push and report the migration version that was applied.
