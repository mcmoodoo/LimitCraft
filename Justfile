# Justfile for 1inch Limit Order API

# Configuration
API_BASE_URL := "https://api.1inch.dev/orderbook/v4.0"
NETWORK_ID := "42161"
LOCAL_API_URL := "localhost:3000"
WALLET_ADDRESS := "0xa53568e4175835369d6F76b93501Dd6789Ab0B41"
AUTH_HEADER := "Authorization:Bearer $ONE_INCH_API_KEY"

# Token addresses
USDC_ADDRESS := "0xaf88d065e77c8cc2239327c5edb3a432268e5831"
WETH_ADDRESS := "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"

# Default amounts
USDC_AMOUNT := "100000000"
WETH_AMOUNT := "1000000000000000"
DEFAULT_EXPIRES := "120"

# Show available commands
default:
    @just --list

get-order order_hash:
    xh GET {{LOCAL_API_URL}}/order/{{order_hash}}

get-orders:
    xh GET {{LOCAL_API_URL}}/orders

create-order:
    xh POST {{LOCAL_API_URL}}/limit-order \
        makerAsset={{USDC_ADDRESS}} \
        takerAsset={{WETH_ADDRESS}} \
        makingAmount={{USDC_AMOUNT}} \
        takingAmount={{WETH_AMOUNT}} \
        expiresIn:={{DEFAULT_EXPIRES}}

create-reverse-order:
    xh POST {{LOCAL_API_URL}}/limit-order \
        makerAsset={{WETH_ADDRESS}} \
        takerAsset={{USDC_ADDRESS}} \
        makingAmount={{WETH_AMOUNT}} \
        takingAmount={{USDC_AMOUNT}} \
        expiresIn:={{DEFAULT_EXPIRES}}

create-custom-order maker_asset taker_asset making_amount taking_amount expires_in=DEFAULT_EXPIRES:
    xh POST {{LOCAL_API_URL}}/limit-order \
        makerAsset={{maker_asset}} \
        takerAsset={{taker_asset}} \
        makingAmount={{making_amount}} \
        takingAmount={{taking_amount}} \
        expiresIn:={{expires_in}}

# 1inch API queries
get-order-by-hash order_hash:
    xh GET "{{API_BASE_URL}}/{{NETWORK_ID}}/order/{{order_hash}}" \
        "{{AUTH_HEADER}}"

get-my-orders:
    xh GET "{{API_BASE_URL}}/{{NETWORK_ID}}/address/{{WALLET_ADDRESS}}" \
        "{{AUTH_HEADER}}" \
        page==1 limit==100 statuses==1,2,3

get-token-positions-from-moralis:
    xh https://deep-index.moralis.io/api/v2.2/0xea95d5D5Ef879D50711855Ed9b012d91101780C8/erc20?chain=eth X-API-Key:${MORALIS_API_KEY}

# Spin up a local podman container running psql 16
run-postgres-container:
    podman run --name our-limit-order-db \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=postgres \
      -e POSTGRES_DB=our-limit-order-db \
      -p 5432:5432 \
      -d postgres:16

rm-postgres-container:
    podman stop our-limit-order-db
    podman rm our-limit-order-db

# Connect to local Postgres running in Podman
psql-connect-local:
    psql "host=localhost port=5432 user=postgres password=postgres dbname=our-limit-order-db"

# Connect to the remote Postgres using environment variables
psql-connect-remote:
    psql "host=${PGHOST} port=${PGPORT} user=${PGUSER} password=${PGPASSWORD} dbname=${PGDATABASE}"
