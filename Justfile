# Orderly - Order Book System Commands

# Install all dependencies
install:
    npm install
    cd frontend && npm install
    cd backend && npm install

# Database commands
db-start:
    podman run --name orderbook-db -e POSTGRES_PASSWORD=password -e POSTGRES_DB=orderbook -p 5432:5432 -d postgres

db-stop:
    podman stop orderbook-db

db-remove:
    podman rm orderbook-db

db-restart: db-stop db-remove db-start

db-logs:
    podman logs -f orderbook-db

db-shell:
    podman exec -it orderbook-db psql -U postgres -d orderbook

db-migrate:
    podman exec -i orderbook-db psql -U postgres -d orderbook < database/init.sql

# Development commands
dev:
    concurrently "just dev-api" "just dev-frontend"

dev-api:
    cd backend && npm run dev

dev-frontend:
    cd frontend && npm run dev

# Build commands
build:
    cd backend && npm run build
    cd frontend && npm run build

# Setup complete environment
setup: db-start install db-migrate
    @echo "Setup complete! Run 'just dev' to start the application"

# Cleanup
clean:
    rm -rf node_modules frontend/node_modules backend/node_modules
    rm -rf frontend/dist backend/dist

# Database status
db-status:
    podman ps -a --filter name=orderbook-db