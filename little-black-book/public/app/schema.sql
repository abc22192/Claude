-- Little Black Book CRM — database schema
-- Four-layer model: PERSON (memory) · INTERACTION (what happened) ·
-- SESSION (what was paid for) · FOLLOW-UP (what happens next).
-- Runs on setup.php. Safe to re-run — everything is CREATE TABLE IF NOT EXISTS.

-- =============================================================================
-- PERSON — relationship memory. One row per person, ever.
-- =============================================================================
CREATE TABLE IF NOT EXISTS contacts (
    id                INT AUTO_INCREMENT PRIMARY KEY,

    -- Identity & Contact
    name              VARCHAR(191) NOT NULL,
    username          VARCHAR(191) DEFAULT NULL,       -- generic handle
    telegram_handle   VARCHAR(191) DEFAULT NULL,       -- exact @handle
    telegram_id       VARCHAR(64)  DEFAULT NULL,       -- numeric Telegram id
    email             VARCHAR(191) DEFAULT NULL,
    chat_on           VARCHAR(191) DEFAULT NULL,       -- Telegram | OF | ATW | X | email...
    met_where         VARCHAR(191) DEFAULT NULL,
    date_met          DATE         DEFAULT NULL,

    -- Relationship Intelligence (kept STRICTLY distinct — see sorter rules)
    fetishes          TEXT         DEFAULT NULL,       -- niches / interests
    magic_words       TEXT         DEFAULT NULL,
    likes_about_me    TEXT         DEFAULT NULL,       -- What They Like About Me
    dream_night       TEXT         DEFAULT NULL,       -- verbatim scenario, NOT a niche word
    tone              VARCHAR(64)  DEFAULT NULL,       -- one of the Voice Router cards
    tone_uncertain    TINYINT(1)   NOT NULL DEFAULT 0, -- 1 if we're unsure; never guess from fetish
    call_me           VARCHAR(255) DEFAULT NULL,       -- what they call Bella
    plans_to_finish   TEXT         DEFAULT NULL,       -- finish/control + future intent

    -- Money & Buying (spent/sessions derived from sessions table)
    payment_method    VARCHAR(191) DEFAULT NULL,
    prompt_payment    VARCHAR(64)  DEFAULT NULL,       -- yes/no/slow
    payment_vibe      VARCHAR(255) DEFAULT NULL,       -- how they pay (haggles / tips / auto)
    spender_tier      VARCHAR(64)  DEFAULT NULL,       -- whale / regular / one-off / window-shop

    -- Product / Offer Awareness (split as spec requires)
    knows_audio         TINYINT(1) NOT NULL DEFAULT 0,
    knows_bella_effect  TINYINT(1) NOT NULL DEFAULT 0,
    knows_inhalers      TINYINT(1) NOT NULL DEFAULT 0,

    -- Flags — captured but never invented
    red_flags         TEXT         DEFAULT NULL,
    green_flags       TEXT         DEFAULT NULL,

    -- Status & Follow-Up
    status            VARCHAR(64)  DEFAULT 'new',
    cadence_days      INT          DEFAULT 7,
    last_contact      DATETIME     DEFAULT NULL,
    next_followup     DATE         DEFAULT NULL,
    followup_reminder VARCHAR(255) DEFAULT NULL,       -- what to remember about the next one
    followup_sent     TINYINT(1)   NOT NULL DEFAULT 0,
    followup_status   VARCHAR(64)  DEFAULT NULL,       -- open / done / no reply / booked

    -- Freeform intel that doesn't fit a field yet (never lost)
    notes             TEXT         DEFAULT NULL,

    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_handle (telegram_handle),
    KEY idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- RAW CAPTURES — original brain dumps, exact text, source of truth. Never edited.
-- =============================================================================
CREATE TABLE IF NOT EXISTS raw_captures (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    source        VARCHAR(32)  NOT NULL DEFAULT 'telegram', -- telegram | web | api
    source_chat   VARCHAR(64)  DEFAULT NULL,
    raw_text      MEDIUMTEXT   NOT NULL,
    contact_id    INT          DEFAULT NULL,
    review_status VARCHAR(32)  NOT NULL DEFAULT 'unsorted', -- unsorted | sorted | review
    received_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_status (review_status),
    KEY idx_contact (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- INTERACTIONS — what just happened. One row per meaningful conversation.
-- Different from raw_captures: a raw is what Bella typed, an interaction is
-- the summarized "this is what went down with this person."
-- =============================================================================
CREATE TABLE IF NOT EXISTS interactions (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    contact_id        INT          NOT NULL,
    raw_capture_id    INT          DEFAULT NULL,
    happened_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    channel           VARCHAR(64)  DEFAULT NULL,      -- Telegram | OF | ATW | ...
    summary           MEDIUMTEXT   NOT NULL,          -- the dump text or a summary
    reaction          TEXT         DEFAULT NULL,      -- what got a reaction
    new_preferences   TEXT         DEFAULT NULL,      -- new preferences revealed
    remember_next     TEXT         DEFAULT NULL,      -- what to remember next time
    status_change     VARCHAR(191) DEFAULT NULL,
    promise_or_commit TEXT         DEFAULT NULL,      -- promised follow-up / custom / booking
    KEY idx_contact_time (contact_id, happened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SESSIONS — what was actually paid for. Separate from PERSON on purpose.
-- Total Spent and Session Count on the person are DERIVED from this table.
-- =============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    contact_id     INT          NOT NULL,
    session_name   VARCHAR(191) NOT NULL,
    session_type   VARCHAR(64)  DEFAULT NULL,        -- e.g. 'bella_effect' | 'custom' | 'call'
    effect_level   VARCHAR(8)   DEFAULT NULL,        -- L1|L2|L3|L4 for Bella Effect
    session_date   DATE         DEFAULT NULL,
    amount_paid    DECIMAL(10,2) DEFAULT NULL,
    notes          TEXT         DEFAULT NULL,
    raw_capture_id INT          DEFAULT NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_contact (contact_id),
    KEY idx_date (session_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- FOLLOW-UPS — what happens next. Rich enough to actually action them.
-- =============================================================================
CREATE TABLE IF NOT EXISTS follow_ups (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT      NOT NULL,
    due_at     DATE     NOT NULL,
    reminder   VARCHAR(255) DEFAULT NULL,
    status     VARCHAR(64)  NOT NULL DEFAULT 'open', -- open | sent | done | no_reply | booked
    sent_at    DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_due (due_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- REVIEW QUEUE — ambiguous dumps waiting for Bella to say who they belong to.
-- =============================================================================
CREATE TABLE IF NOT EXISTS review_queue (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    raw_capture_id INT          NOT NULL,
    reason         VARCHAR(255) DEFAULT NULL,
    resolved       TINYINT(1)   NOT NULL DEFAULT 0,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_resolved (resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- CHAT CONTEXT — per-chat active person so a follow-up line attaches to who
-- Bella is talking about, even without a name in the dump.
-- =============================================================================
CREATE TABLE IF NOT EXISTS chat_context (
    chat_id       VARCHAR(64) PRIMARY KEY,
    contact_id    INT         DEFAULT NULL,
    awaiting      VARCHAR(32) DEFAULT NULL,          -- e.g. 'who' when we asked
    pending_raw   INT         DEFAULT NULL,
    updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
