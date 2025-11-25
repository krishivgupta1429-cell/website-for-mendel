CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'user'
);


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


SET default_table_access_method = heap;

--
-- Name: donations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.donations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    form_submission_id uuid NOT NULL,
    sponsorship_level text,
    amount_cents integer NOT NULL,
    cans_amount_cents integer DEFAULT 0,
    stripe_customer_id text,
    stripe_checkout_session_id text,
    stripe_payment_intent_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    CONSTRAINT donations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text]))),
    CONSTRAINT positive_amount CHECK ((amount_cents > 0)),
    CONSTRAINT valid_status CHECK ((status = ANY (ARRAY['not_required'::text, 'pending'::text, 'succeeded'::text, 'failed'::text])))
);


--
-- Name: form_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    reason text,
    reason_other text,
    sponsorships text[],
    cans_quantity integer DEFAULT 0,
    comments text,
    email_updates_opt_in boolean DEFAULT false,
    verification_token text,
    verification_sent_at timestamp with time zone,
    wants_to_donate boolean DEFAULT false,
    area_code text,
    phone_number text,
    is_donor boolean DEFAULT false,
    full_phone text,
    payment_status text DEFAULT 'pending'::text,
    stripe_customer_id text,
    stripe_checkout_session_id text,
    stripe_payment_intent_id text,
    payment_amount_cents integer DEFAULT 0,
    number_of_adults integer,
    number_of_children integer DEFAULT 0,
    CONSTRAINT comments_length CHECK (((comments IS NULL) OR (char_length(comments) <= 2000))),
    CONSTRAINT email_format CHECK ((email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text)),
    CONSTRAINT full_name_length CHECK (((char_length(full_name) >= 1) AND (char_length(full_name) <= 100))),
    CONSTRAINT valid_payment_status CHECK ((payment_status = ANY (ARRAY['pending'::text, 'success'::text, 'fail'::text, 'none'::text])))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: donations donations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_pkey PRIMARY KEY (id);


--
-- Name: form_submissions form_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: idx_donations_form_submission_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_donations_form_submission_id ON public.donations USING btree (form_submission_id);


--
-- Name: idx_donations_stripe_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_donations_stripe_session ON public.donations USING btree (stripe_checkout_session_id);


--
-- Name: idx_form_submissions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submissions_created_at ON public.form_submissions USING btree (created_at DESC);


--
-- Name: idx_form_submissions_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submissions_email ON public.form_submissions USING btree (email);


--
-- Name: idx_form_submissions_verification_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_submissions_verification_token ON public.form_submissions USING btree (verification_token) WHERE (verification_token IS NOT NULL);


--
-- Name: donations donations_form_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_form_submission_id_fkey FOREIGN KEY (form_submission_id) REFERENCES public.form_submissions(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles Admins can manage all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all roles" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: donations Anyone can insert donations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert donations" ON public.donations FOR INSERT WITH CHECK (true);


--
-- Name: form_submissions Anyone can insert form submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert form submissions" ON public.form_submissions FOR INSERT WITH CHECK (true);


--
-- Name: form_submissions Anyone can verify email with valid token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can verify email with valid token" ON public.form_submissions FOR UPDATE USING ((verification_token IS NOT NULL)) WITH CHECK ((verification_token IS NULL));


--
-- Name: donations Only admins can delete donations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete donations" ON public.donations FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: form_submissions Only admins can delete form submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete form submissions" ON public.form_submissions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: donations Only admins can read donations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can read donations" ON public.donations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: form_submissions Only admins can read form submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can read form submissions" ON public.form_submissions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: donations Only admins can update donations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can update donations" ON public.donations FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: form_submissions Only admins can update form submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can update form submissions" ON public.form_submissions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: donations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

--
-- Name: form_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


