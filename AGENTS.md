<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Roles live in `public.user_roles` (admin/remessa/faturamento); unit scoping uses `public.current_unit()` in RLS — never trust client role checks.
- Load history and automatic "faturada" transition are DB triggers on `loads`/`load_items`, so every write path is logged consistently.
- Spreadsheet paste parsing lives in `src/lib/parse-loads.ts` (pure, covered by `src/test/parse-loads.test.ts`).
- User creation/activation goes through admin server functions in `src/lib/admin.functions.ts` (service role loaded inside handlers after `has_role` check).
- PWA is manifest-only (no service worker) for desktop install.
- Loads are grouped by `import_date` (day imported); `load_date` is only the forecast from the pasted line.
- Itineraries are fixed per destination center in `public.itineraries` (admin-managed), never edited in billing.
