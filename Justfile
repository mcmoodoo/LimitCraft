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

moralis-token-positions address="0xea95d5D5Ef879D50711855Ed9b012d91101780C8":
    xh https://deep-index.moralis.io/api/v2.2/{{address}}/erc20?chain=arbitrum X-API-Key:${MORALIS_API_KEY}

get-1inch-token-info-arbitrum:
    xh GET "https://api.1inch.dev/token/v1.2/42161?provider=1inch&country=US" \
      Authorization:"Bearer ${ONE_INCH_API_KEY}" \
      accept:application/json \
      content-type:application/json

one-inch-balances-and-allowances spender:
    xh \
      GET "https://api.1inch.dev/balance/v1.2/42161/aggregatedBalancesAndAllowances/{{spender}}" \
      Authorization:"Bearer $ONE_INCH_API_KEY" \
      accept:application/json \
      content-type:application/json

one-inch-balances address="0xa53568e4175835369d6F76b93501Dd6789Ab0B41":
    xh \
      GET "https://api.1inch.dev/balance/v1.2/42161/balances/{{address}}" \
      Authorization:"Bearer $ONE_INCH_API_KEY" \
      accept:application/json \
      content-type:application/json

one-inch-token-details contractAddress="0xaf88d065e77c8cc2239327c5edb3a432268e5831": # default USDC on Arbitrum
    xh \
      GET "https://api.1inch.dev/token-details/v1.0/details/42161/{{contractAddress}}" \
      Authorization:"Bearer $ONE_INCH_API_KEY" \
      accept:application/json \
      content-type:application/json

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
