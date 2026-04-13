--
-- PostgreSQL database dump
--

\restrict A90tjF8c5SJm8L3KSfMTYnd5I9PfvupzV9F3JuwjcFeJSGvyP84BHMgNxZijT6n

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cdrs; Type: TABLE; Schema: public; Owner: n2phone
--

CREATE TABLE public.cdrs (
    id text NOT NULL,
    month character(7) NOT NULL,
    from_call_id text NOT NULL,
    from_value text,
    from_name text,
    from_user text,
    to_value text,
    to_user text,
    to_id text,
    start_time timestamp with time zone NOT NULL,
    answer_time timestamp with time zone,
    end_time timestamp with time zone,
    duration integer,
    call_type text,
    raw jsonb NOT NULL
);


ALTER TABLE public.cdrs OWNER TO n2phone;

--
-- Name: monthly_kpi_snapshots; Type: TABLE; Schema: public; Owner: n2phone
--

CREATE TABLE public.monthly_kpi_snapshots (
    month character(7) NOT NULL,
    computed_at timestamp with time zone NOT NULL,
    kpis jsonb NOT NULL,
    bh_kpis jsonb
);


ALTER TABLE public.monthly_kpi_snapshots OWNER TO n2phone;

--
-- Name: monthly_pull_log; Type: TABLE; Schema: public; Owner: n2phone
--

CREATE TABLE public.monthly_pull_log (
    id integer NOT NULL,
    month character(7) NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    record_counts jsonb,
    error text,
    progress_pct integer DEFAULT 0,
    progress_message text,
    total_pages integer
);


ALTER TABLE public.monthly_pull_log OWNER TO n2phone;

--
-- Name: monthly_pull_log_id_seq; Type: SEQUENCE; Schema: public; Owner: n2phone
--

CREATE SEQUENCE public.monthly_pull_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.monthly_pull_log_id_seq OWNER TO n2phone;

--
-- Name: monthly_pull_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: n2phone
--

ALTER SEQUENCE public.monthly_pull_log_id_seq OWNED BY public.monthly_pull_log.id;


--
-- Name: queue_stats; Type: TABLE; Schema: public; Owner: n2phone
--

CREATE TABLE public.queue_stats (
    queue_id text NOT NULL,
    month character(7) NOT NULL,
    description text,
    call_volume integer,
    calls_offered integer,
    calls_handled integer,
    abandoned_calls integer,
    calls_forwarded integer,
    average_talk_time numeric,
    average_handle_time numeric,
    average_answer_speed numeric,
    service_level numeric,
    abandoned_rate numeric,
    raw jsonb NOT NULL
);


ALTER TABLE public.queue_stats OWNER TO n2phone;

--
-- Name: tickets; Type: TABLE; Schema: public; Owner: n2phone
--

CREATE TABLE public.tickets (
    id integer NOT NULL,
    month character(7) NOT NULL,
    summary text,
    date_entered timestamp with time zone,
    phone_number text,
    source_id integer,
    raw jsonb NOT NULL
);


ALTER TABLE public.tickets OWNER TO n2phone;

--
-- Name: monthly_pull_log id; Type: DEFAULT; Schema: public; Owner: n2phone
--

ALTER TABLE ONLY public.monthly_pull_log ALTER COLUMN id SET DEFAULT nextval('public.monthly_pull_log_id_seq'::regclass);


--
-- Name: cdrs cdrs_pkey; Type: CONSTRAINT; Schema: public; Owner: n2phone
--

ALTER TABLE ONLY public.cdrs
    ADD CONSTRAINT cdrs_pkey PRIMARY KEY (id, month);


--
-- Name: monthly_kpi_snapshots monthly_kpi_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: n2phone
--

ALTER TABLE ONLY public.monthly_kpi_snapshots
    ADD CONSTRAINT monthly_kpi_snapshots_pkey PRIMARY KEY (month);


--
-- Name: monthly_pull_log monthly_pull_log_month_key; Type: CONSTRAINT; Schema: public; Owner: n2phone
--

ALTER TABLE ONLY public.monthly_pull_log
    ADD CONSTRAINT monthly_pull_log_month_key UNIQUE (month);


--
-- Name: monthly_pull_log monthly_pull_log_pkey; Type: CONSTRAINT; Schema: public; Owner: n2phone
--

ALTER TABLE ONLY public.monthly_pull_log
    ADD CONSTRAINT monthly_pull_log_pkey PRIMARY KEY (id);


--
-- Name: queue_stats queue_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: n2phone
--

ALTER TABLE ONLY public.queue_stats
    ADD CONSTRAINT queue_stats_pkey PRIMARY KEY (queue_id, month);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: n2phone
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id, month);


--
-- Name: idx_cdrs_from_call_id; Type: INDEX; Schema: public; Owner: n2phone
--

CREATE INDEX idx_cdrs_from_call_id ON public.cdrs USING btree (from_call_id, month);


--
-- Name: idx_cdrs_month; Type: INDEX; Schema: public; Owner: n2phone
--

CREATE INDEX idx_cdrs_month ON public.cdrs USING btree (month);


--
-- Name: idx_queue_stats_month; Type: INDEX; Schema: public; Owner: n2phone
--

CREATE INDEX idx_queue_stats_month ON public.queue_stats USING btree (month);


--
-- Name: idx_tickets_month; Type: INDEX; Schema: public; Owner: n2phone
--

CREATE INDEX idx_tickets_month ON public.tickets USING btree (month);


--
-- PostgreSQL database dump complete
--

\unrestrict A90tjF8c5SJm8L3KSfMTYnd5I9PfvupzV9F3JuwjcFeJSGvyP84BHMgNxZijT6n

