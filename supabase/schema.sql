-- ============================================================
-- Octrack — Schéma Supabase
-- Exécuter dans l'éditeur SQL de Supabase Dashboard
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
-- (uuid-ossp disponible par défaut sur Supabase)

-- ── Table : profiles ────────────────────────────────────────
-- Stocke les préférences véhicule / app liées à un compte auth
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT        NOT NULL UNIQUE,
  car_brand     TEXT,
  car_model     TEXT,
  car_year      TEXT,
  tank_capacity NUMERIC(5,1),
  fuel_type     TEXT        DEFAULT 'sp95',
  theme         TEXT        DEFAULT 'dark',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Table : fill_ups ────────────────────────────────────────
-- Chaque plein est identifié par un UUID côté client (offline-first)
CREATE TABLE IF NOT EXISTS public.fill_ups (
  id              TEXT        PRIMARY KEY,           -- UUID généré côté client
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            TEXT        NOT NULL,              -- YYYY-MM-DD
  liters          NUMERIC(6,2) NOT NULL,
  price_per_liter NUMERIC(6,4) NOT NULL,
  total_cost      NUMERIC(7,2) NOT NULL,
  km              NUMERIC(10,1),
  station         TEXT,
  notes           TEXT,
  fuel_type       TEXT,
  deleted_at      TIMESTAMPTZ,                       -- soft delete
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Index de performance ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS fill_ups_user_id_idx  ON public.fill_ups (user_id);
CREATE INDEX IF NOT EXISTS fill_ups_date_idx     ON public.fill_ups (user_id, date DESC);
CREATE INDEX IF NOT EXISTS fill_ups_deleted_idx  ON public.fill_ups (user_id, deleted_at);

-- ── Trigger : updated_at auto ───────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_fill_ups_updated_at
  BEFORE UPDATE ON public.fill_ups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Trigger : créer profile à l'inscription ─────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'username', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE public.profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fill_ups  ENABLE ROW LEVEL SECURITY;

-- profiles : lecture/écriture par le propriétaire uniquement
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- fill_ups : lecture/écriture par le propriétaire uniquement
CREATE POLICY "fill_ups_select_own" ON public.fill_ups
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "fill_ups_insert_own" ON public.fill_ups
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fill_ups_update_own" ON public.fill_ups
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fill_ups_delete_own" ON public.fill_ups
  FOR DELETE USING (auth.uid() = user_id);
