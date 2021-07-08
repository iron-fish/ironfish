CREATE TABLE accounts (
    id CHARACTER VARYING NOT NULL,
    public_address CHARACTER VARYING NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id)
);

CREATE INDEX index_accounts_on_public_address ON public.accounts USING btree (public_address);
