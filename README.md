# Orderly

A complete DEX orderbook platform built on 1inch Limit Order Protocol. Create and manage limit orders on Arbitrum with automated filling and a modern Web3 frontend.

## Project Structure

- **`api/`** - Elysia.js backend API for order management
- **`ui/`** - React frontend with RainbowKit and Wagmi wallet integration  
- **`db/`** - PostgreSQL database layer with Drizzle ORM
- **`resolver/`** - Automated order resolver and filler
- **`contracts/`** - Foundry smart contracts with 1inch Limit Order Protocol integration

## Smart Contracts

The `contracts/` directory contains Foundry-based smart contracts for 1inch Limit Order Protocol integration, including custom interaction managers for lending protocols.

### Setup

```bash
# Initialize git submodules
git submodule update --init --recursive

# Navigate to contracts directory
cd contracts

# Build contracts
forge build

# Run tests
forge test
```

### Dependencies

- **1inch Limit Order Protocol** - Core limit order functionality
- **OpenZeppelin Contracts** - Standard secure contract implementations  
- **1inch Solidity Utils** - Utility libraries

Dependencies are managed as git submodules in `lib/`.

## Prerequisites

- Bun runtime
- Podman or Docker (for PostgreSQL)
- Just command runner (optional, for database recipes)

## Quick Start

### Database Setup

Create and start a local PostgreSQL container:

```bash
# Using Just recipes
just postgres-container-run

# Or manually with Podman
podman run --name our-limit-order-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=our-limit-order-db \
  -p 5432:5432 \
  -d postgres:16
```

Initialize the database:

```bash
cd db
bun install
bun run setup
```

### Application Setup

Initialize git submodules:

```bash
git submodule update --init --recursive
```

Install dependencies:

```bash
bun install
```

Start development servers:

```bash
# Start API + UI
bun run dev

# Or start all services including resolver
bun run dev:all
```

### Order Resolver (Optional)

To enable automated order filling:

```bash
cd resolver
cp .env.example .env
# Configure with your private key and 1inch API key
bun install
bun run start
```

## Available Scripts

### Development

- `bun run dev` - Start API and frontend concurrently
- `bun run dev:all` - Start API, frontend, and resolver
- `bun run dev:api` - Start API server only
- `bun run dev:ui` - Start frontend only
- `bun run dev:resolver` - Start resolver only

### Build

- `bun run build:api` - Build API
- `bun run build:ui` - Build frontend  
- `bun run build:resolver` - Build resolver

### Code Quality

- `bun run typecheck` - TypeScript type checking
- `bun run lint` - Lint code with Biome
- `bun run format` - Format code with Biome

## Database Management

### PostgreSQL Container

Using Just recipes:

```bash
# Start PostgreSQL container
just postgres-container-run

# Connect to local database
just psql-connect-local

# Connect to remote database
just psql-connect-remote

# Stop and remove container
just postgres-container-remove
```

### Database Operations

```bash
cd db

# Initialize database and create tables
bun run setup

# Reset database
bun run reset

# Open Drizzle Studio
bun run studio
```

## Architecture

The application follows a microservices architecture:

1. **Order Creation**: Users create orders via the React frontend
2. **API Storage**: Orders are stored in PostgreSQL via the Elysia.js API
3. **Order Monitoring**: Resolver service polls for pending orders
4. **Profitability Check**: Market prices checked via 1inch API
5. **Order Filling**: Profitable orders filled via 1inch Limit Order Protocol
6. **Status Updates**: Database updated with execution status

## Technology Stack

- **Frontend**: React + Vite + TailwindCSS + RainbowKit + Wagmi
- **Backend**: Elysia.js (Bun runtime)
- **Database**: PostgreSQL + Drizzle ORM
- **Blockchain**: 1inch Limit Order Protocol on Arbitrum
- **Smart Contracts**: Foundry + OpenZeppelin
- **Automation**: Custom resolver service
