-- Orderly Database Schema
-- This file contains the complete database setup for the order book system

-- Create enum for order status
CREATE TYPE order_status AS ENUM ('pending', 'filled', 'cancelled');

-- Create orders table
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
CREATE INDEX idx_orders_maker_address ON orders(maker_address);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- Auto-update `updated_at` on row update
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
CREATE TRIGGER trg_update_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();