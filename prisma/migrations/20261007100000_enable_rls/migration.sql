-- Alerte Supabase "rls_disabled_in_public" : sans RLS, toute personne qui connait l'URL du
-- projet et la cle anon pourrait lire, modifier et supprimer ces tables via l'API REST
-- Supabase (PostgREST). L'app n'utilise jamais cette API : elle se connecte en direct avec
-- le role postgres (BYPASSRLS), qui ignore la RLS. On active donc la RLS sans aucune
-- policy : les roles anon et authenticated n'ont plus aucun acces, l'app ne change pas.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
