CREATE TABLE accounts (
    id SERIAL PRIMARY KEY NOT NULL,
    public_address VARCHAR NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX index_accounts_on_public_address ON public.accounts USING btree (public_address);
