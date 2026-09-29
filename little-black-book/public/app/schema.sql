-- Little Black Book CRM — database schema
-- Runs automatically the first time you visit setup.php, but you can also
-- paste it into Hostinger hPanel > phpMyAdmin > SQL if you prefer.
--
-- Design rule from the spec: the RAW brain dump is saved first and NEVER
-- rewritten. Everything else (contacts, messages) is derived from it, so the
-- original is always recoverable.

CREATE TABLE IF NOT EXISTS contacts (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(191) NOT NULL,
    telegram_handle VARCHAR(191) DEFAULT NULL,
    platform        VARCHAR(191) DEFAULT NULL,   -- where you met / talk to them
    call_me         VARCHAR(191) DEFAULT NULL,   -- what they call you
    tone            VARCHAR(255) DEFAULT NULL,    -- how they like to be talked to
    magic_words     TEXT         DEFAULT NULL,
    likes_about_me  TEXT         DEFAULT NULL,
    dream_night     TEXT         DEFAULT NULL,
    fetishes        TEXT         DEFAULT NULL,    -- interests / kinks
    plans_to_finish TEXT         DEFAULT NULL,
    product_awareness TEXT       DEFAULT NULL,    -- what they already know about
    payment_info    VARCHAR(255) DEFAULT NULL,
    spending        VARCHAR(255) DEFAULT NULL,
    status          VARCHAR(64)  DEFAULT 'new',
    cadence_days    INT          DEFAULT 7,       -- how often to follow up
    last_contact    DATETIME     DEFAULT NULL,
    next_followup   DATE         DEFAULT NULL,
    notes           TEXT         DEFAULT NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_handle (telegram_handle)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Raw brain dumps, preserved exactly as received. Source of truth.
CREATE TABLE IF NOT EXISTS raw_captures (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    source        VARCHAR(32)  NOT NULL DEFAULT 'telegram',
    source_chat   VARCHAR(64)  DEFAULT NULL,   -- telegram chat id
    raw_text      MEDIUMTEXT   NOT NULL,
    contact_id    INT          DEFAULT NULL,   -- filled once sorted
    review_status VARCHAR(32)  NOT NULL DEFAULT 'unsorted', -- unsorted|sorted|review
    received_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_status (review_status),
    KEY idx_contact (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Conversation / interaction history per contact.
CREATE TABLE IF NOT EXISTS messages (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    contact_id     INT          NOT NULL,
    raw_capture_id INT          DEFAULT NULL,
    direction      VARCHAR(16)  NOT NULL DEFAULT 'note', -- note|from_them|to_them
    body           MEDIUMTEXT   NOT NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_contact (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Follow-ups to surface later.
CREATE TABLE IF NOT EXISTS follow_ups (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT      NOT NULL,
    due_at     DATE     NOT NULL,
    note       VARCHAR(255) DEFAULT NULL,
    done       TINYINT(1)   NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_due (due_at, done)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ambiguous dumps that need Bella to decide who they belong to.
CREATE TABLE IF NOT EXISTS review_queue (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    raw_capture_id INT          NOT NULL,
    reason         VARCHAR(255) DEFAULT NULL,
    resolved       TINYINT(1)   NOT NULL DEFAULT 0,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_resolved (resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Remembers, per Telegram chat, which person the next dump is about, so a
-- follow-up line ("she also loves...") attaches to the right record.
CREATE TABLE IF NOT EXISTS chat_context (
    chat_id       VARCHAR(64) PRIMARY KEY,
    contact_id    INT         DEFAULT NULL,
    awaiting      VARCHAR(32) DEFAULT NULL,  -- e.g. 'who' when we asked who it is
    pending_raw   INT         DEFAULT NULL,  -- raw_capture waiting to be attached
    updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
