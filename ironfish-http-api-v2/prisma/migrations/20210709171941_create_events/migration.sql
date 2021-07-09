CREATE TYPE event_type AS ENUM (
    'BLOCK_MINED',
    'BUG_CAUGHT',
    'COMMUNITY_CONTRIBUTION',
    'NODE_HOSTED',
    'PULL_REQUEST_MERGED',
    'SOCIAL_MEDIA_PROMOTION'
);

CREATE TABLE events (
    id SERIAL PRIMARY KEY NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    account_id INTEGER NOT NULL,
    type event_type NOT NULL
);

CREATE INDEX index_events_on_account_id ON events(account_id);

ALTER TABLE ONLY events ADD CONSTRAINT "FK__events__account_id" FOREIGN KEY (account_id) REFERENCES accounts(id);
