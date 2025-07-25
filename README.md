# Orderly - Decentralized Order Book System

A complete decentralized order book application built for the hackathon, featuring React frontend, Node.js backend API, and PostgreSQL database to manage limit orders with EIP712 signature verification.

## 🏗️ Architecture

- **Frontend**: React + Vite + TailwindCSS + RainbowKit + Wagmi
- **Backend**: Node.js + Express.js + PostgreSQL
- **Database**: PostgreSQL with order management schema
- **Authentication**: EIP712 signature verification

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL (or Podman/Docker)
- Just command runner (optional but recommended)

### Setup with Just (Recommended)

```bash
# Install Just command runner if not installed
curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to ~/.local/bin

# Setup entire project
just setup

# Start development servers
just dev
```

### Manual Setup

1. **Install dependencies**:
   ```bash
   npm install
   cd frontend && npm install
   cd ../backend && npm install
   ```

2. **Start PostgreSQL database**:
   ```bash
   podman run --name orderbook-db -e POSTGRES_PASSWORD=password -e POSTGRES_DB=orderbook -p 5432:5432 -d postgres
   ```

3. **Run database migrations**:
   ```bash
   PGPASSWORD=password psql -h localhost -U postgres -d orderbook -f database/init.sql
   ```

4. **Start backend API**:
   ```bash
   cd backend && npm run dev
   ```

5. **Start frontend (in new terminal)**:
   ```bash
   cd frontend && npm run dev
   ```

## 📋 Available Commands

### Just Commands

- `just install` - Install all dependencies
- `just db-start` - Start PostgreSQL container
- `just db-stop` - Stop PostgreSQL container
- `just db-migrate` - Run database migrations
- `just dev` - Start both frontend and backend
- `just build` - Build both applications
- `just setup` - Complete environment setup

### NPM Scripts

- `npm run dev:frontend` - Start frontend only
- `npm run dev:api` - Start backend only
- `npm run build:frontend` - Build frontend
- `npm run build:api` - Build backend

## 🌐 API Endpoints

### GET `/api/orders`
Retrieve all orders with optional filtering:
- `status` - Filter by order status (pending, filled, cancelled)
- `maker` - Filter by maker address
- `limit` - Limit number of results (default: 50)
- `offset` - Pagination offset (default: 0)

### GET `/api/order/:orderHash`
Get individual order details by order hash.

### POST `/api/limit-order`
Create a new limit order with EIP712 signature.

## 💻 Frontend Features

### Pages
- **Home**: Welcome page with system overview
- **Orders**: List all orders with filtering and pagination
- **Order Details**: Comprehensive view of individual orders
- **Create Order**: Form to create new orders with wallet integration

### Wallet Integration
- RainbowKit for wallet connection
- EIP712 typed data signing
- Automatic maker address detection

## 🗄️ Database Schema

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
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/orderbook
API_PORT=3000
FRONTEND_PORT=5173
```

### Database Connection

- **Host**: localhost
- **Port**: 5432
- **Database**: orderbook
- **Username**: postgres
- **Password**: password

## 🧪 Testing

1. **Health Check**: `curl http://localhost:3000/health`
2. **Orders API**: `curl http://localhost:3000/api/orders`
3. **Frontend**: Open `http://localhost:5173` in browser

## 🛠️ Development

### Adding New Features

1. **Backend**: Add routes in `backend/src/routes/`
2. **Frontend**: Add components in `frontend/src/components/` or pages in `frontend/src/pages/`
3. **Database**: Add migrations in `database/` directory

### Code Structure

```
orderly/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── utils/
│   │   ├── database.js
│   │   └── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── config/
│   └── package.json
├── database/
│   └── init.sql
├── Justfile
└── package.json
```

## 🚨 Security

- EIP712 signature verification for all orders
- Input validation and sanitization
- Rate limiting on API endpoints
- Parameterized database queries to prevent SQL injection

## 📝 License

This project was created for a hackathon and is available for educational and demonstration purposes.

## 🤝 Contributing

This is a hackathon project. Feel free to fork and extend for your own use cases!

---

**Built with ❤️ for the Unite Hackathon**