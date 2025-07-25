# Orderly - Order Book System Design

## Overview

This document outlines the system design for an order book application built for the hackathon. The system consists of a React frontend, Node.js backend API, and PostgreSQL database to manage limit orders with EIP712 signature verification.

## Architecture Overview

The system is composed of three main components:

1. **Frontend Web Application** - React-based UI for order management
2. **Backend API** - RESTful API for order processing
3. **PostgreSQL Database** - Persistent storage for orders
4. **Top-level Justfile** - contains recipes for all the common commands (including spinning up and maniupating the podman container as well as postgres db commands)

## Frontend Web Application

### Technology Stack

```json
{
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
  }
}
```

### Pages and Features

#### Wallet Integration

- **EIP712 Signing**: Integrate Wagmi wallet for signing structured order data
- **Wallet Connection**: RainbowKit integration for seamless wallet connectivity
- **Address Management**: Display connected wallet address and balance

#### Order Management Pages

- **Orders List Page**: Display all orders from PostgreSQL database with filtering and sorting
- **Order Details Page**: Comprehensive view of individual order information including:
  - Order hash, maker/taker assets, amounts
  - Signature verification status
  - Order status and timestamps
  - Maker traits and extensions
- **Create Order Page**: Form interface for placing limit orders with:
  - Asset selection (maker/taker)
  - Amount specification (making/taking amounts)
  - Expiration date/time picker
  - Advanced maker traits configuration (collapsible section)
  - Order preview and confirmation

#### Technical Requirements

- **Database Connection**: Connect to PostgreSQL running on localhost
  - Database: `orderbook`
  - Table: `orders`
  - Default credentials
- **Real-time Updates**: Use React Query for data fetching and caching
- **Responsive Design**: Mobile-first approach with Tailwind CSS

## Backend API

### Configuration

- **CORS Settings**: Allow origin 'http://localhost:5173'
- **Port**: 3001 (default)
- **Database**: PostgreSQL connection with pooling

### API Endpoints

#### GET `/orders`

- **Purpose**: Retrieve all orders from the database
- **Query Parameters**:
  - `status` (optional): Filter by order status
  - `maker` (optional): Filter by maker address
  - `limit` (optional): Limit number of results
  - `offset` (optional): Pagination offset
- **Response**: Array of order objects with full details

#### GET `/order/:orderHash`

- **Purpose**: Get individual order details by order hash
- **Parameters**: `orderHash` - 66-character hex string
- **Response**: Single order object or 404 if not found

#### POST `/limit-order`

- **Purpose**: Create and save a new limit order
- **Request Body**:
  ```json
  {
    "makerAsset": "0x...",
    "takerAsset": "0x...",
    "makingAmount": "1000000000000000000",
    "takingAmount": "2000000000000000000",
    "makerAddress": "0x...",
    "expiresIn": "2024-12-31T23:59:59Z",
    "signature": "0x...",
    "makerTraits": {},
    "extension": {}
  }
  ```
- **Response**: Created order object with generated order_hash

### Validation and Security

- **Input Validation**: Validate all incoming data types and formats
- **Signature Verification**: Verify EIP712 signatures before saving
- **Rate Limiting**: Implement basic rate limiting per IP
- **Error Handling**: Comprehensive error responses with appropriate HTTP status codes

## PostgreSQL Database

Use the latest postgres version. Prepare all the initial migration to create the database and the table schemas. Add the commands to the top-level Justfile.

### Database Schema

The database uses a single `orders` table to store all limit order information with proper indexing for performance.

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

### Setup Instructions

1. **Install PostgreSQL**: Use Docker/Podman container for development

   ```bash
   podman run --name orderbook-db -e POSTGRES_PASSWORD=password -e POSTGRES_DB=orderbook -p 5432:5432 -d postgres
   ```

2. **Initialize Schema**: Run the SQL commands above to create tables and triggers

3. **Connection Details**:
   - Host: localhost
   - Port: 5432
   - Database: orderbook
   - Username: postgres
   - Password: password

### Quick Start

1. Clone repository
2. Install dependencies: `npm install`
3. Start PostgreSQL container
4. Run database migrations
5. Start backend API: `npm run dev:api`
6. Start frontend: `npm run dev:frontend`

### Environment Variables

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/orderbook
API_PORT=3000
FRONTEND_PORT=5173
```
