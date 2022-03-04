CREATE TABLE payout (
    id INTEGER PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE share (
    id INTEGER PRIMARY KEY,
    public_address TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    payout_id INTEGER,
    CONSTRAINT share_fk_payout_id FOREIGN KEY (payout_id) REFERENCES payout (id)
);