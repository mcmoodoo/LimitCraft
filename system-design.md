So I am starting from scratch to meet the time requirement of the hackathon.

## System Design

1. Front end web App
2. Back end API
3. Postgres DB

### Front End Web App

```JSON
  "dependencies": {
    "@rainbow-me/rainbowkit": "^2.2.8",
    "@tailwindcss/vite": "^4.1.11",
    "@tanstack/react-query": "^5.83.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^7.6.3",
    "tailwindcss": "^4.1.11",
    "viem": "^2.31.7",
    "wagmi": "^2.15.6"
  },
```

#### Pages

- Wagmi wallet to sign EIP712. Sign a structured data similar to LOP's order that will eventually go to the `orders` database table.
- Orders page pulling and displaying all the orders from the postgres db (assume a podman container running on localhost with default settings and credentials). dbname=orderbook, table=orders
- Order details page to beautifully display all the order information.
- Create order page to place a limit order specifying makerAsset, takerAsset, amountMaker, amountTaker, expiration, all the makerTraits (have default in place and hide by default, have a toggle to show and customize)

### Back End API

A simple api with CORS allowing origin: 'http://localhost:5173' and following routes exposed:

- GET `/orders` to get all orders
- GET `/order/:orderHash` to get individual order details by order_hash
- POST`/limit-orer` to create a limit-order and save it in the database

### Resolver

### Postgresql

```sql
CREATE TYPE order_status AS ENUM ('pending', 'filled', 'cancelled');

CREATE TABLE orders (
    order_hash VARCHAR(66) PRIMARY KEY,
    maker_asset VARCHAR(42) NOT NULL,
    taker_asset VARCHAR(42) NOT NULL,
    making_amount NUMERIC(78,0) NOT NULL,
    taking_amount NUMERIC(78,0) NOT NULL,
    maker_address VARCHAR(42) NOT NULL,
    expires_in TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    signature BYTEA NOT NULL,
    maker_traits JSONB NOT NULL,
    extension JSONB NOT NULL,
    status order_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_expires_in ON orders(expires_in);

-- Auto-update `updated_at` on row update
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;

$$
LANGUAGE plpgsql;

CREATE TRIGGER trg_update_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
```
