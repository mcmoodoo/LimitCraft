default:
    @just --list

# Start local PostgreSQL container
db-container:
    docker run --name orderly-db \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=postgres \
      -e POSTGRES_DB=orderly \
      -p 5432:5432 \
      -d postgres:16

get-token-positions-from-moralis address="0xea95d5D5Ef879D50711855Ed9b012d91101780C8":
    xh https://deep-index.moralis.io/api/v2.2/{{address}}/erc20?chain=arbitrum X-API-Key:${MORALIS_API_KEY}

# Spin up a local podman container running psql 16
postgres-container-run:
    podman run --name our-limit-order-db \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=postgres \
      -e POSTGRES_DB=our-limit-order-db \
      -p 5432:5432 \
      -d postgres:16

postgres-container-remove:
    podman stop our-limit-order-db
    podman rm our-limit-order-db

# Connect to local Postgres running in Podman
psql-connect-local:
    psql "host=localhost port=5432 user=postgres password=postgres dbname=our-limit-order-db"

# Connect to the remote Postgres using environment variables
psql-connect-remote:
    psql "host=${PGHOST} port=${PGPORT} user=${PGUSER} password=${PGPASSWORD} dbname=${PGDATABASE}"
