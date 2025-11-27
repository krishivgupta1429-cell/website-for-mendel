-- Add indoor_celebration column if not exists
ALTER TABLE public.form_submissions ADD COLUMN IF NOT EXISTS indoor_celebration text;

-- Remove unused columns
ALTER TABLE public.form_submissions DROP COLUMN IF EXISTS reason;
ALTER TABLE public.form_submissions DROP COLUMN IF EXISTS reason_other;
ALTER TABLE public.form_submissions DROP COLUMN IF EXISTS cans_quantity;
ALTER TABLE public.form_submissions DROP COLUMN IF EXISTS comments;
ALTER TABLE public.form_submissions DROP COLUMN IF EXISTS email_updates_opt_in;