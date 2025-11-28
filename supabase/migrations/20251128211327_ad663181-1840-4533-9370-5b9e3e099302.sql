-- Add other_donation_amount column to form_submissions
ALTER TABLE public.form_submissions
ADD COLUMN IF NOT EXISTS other_donation_amount integer DEFAULT NULL;