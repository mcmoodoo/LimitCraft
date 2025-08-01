In the back end api, I need to use 1inch's api instead of Moralis to get token info and balances for the user's tokens.

1 inch has two API endpoints that can satisfy this. By combing them, you can get the required data to replace Moralis' API in the back end.

1. In justfile, there's an example request for

```bash
one-inch-balances address="0xa53568e4175835369d6F76b93501Dd6789Ab0B41":
    xh \
      GET "https://api.1inch.dev/balance/v1.2/42161/balances/{{address}}" \
      Authorization:"Bearer $ONE_INCH_API_KEY" \
      accept:application/json \
      content-type:application/json
```

that will get a response like in api_data/my-positions.

2. then for every token with non-zero balance, you can call

```bash
one-inch-token-details contractAddress="0xaf88d065e77c8cc2239327c5edb3a432268e5831": # default USDC on Arbitrum
    xh \
      GET "https://api.1inch.dev/token-details/v1.0/details/42161/{{contractAddress}}" \
      Authorization:"Bearer $ONE_INCH_API_KEY" \
      accept:application/json \
      content-type:application/json
```

that will get you something like this:

```json
{
  "details": {
    "circulatingSupply": 64047253281.46785,
    "totalSupply": 64050299947.60326,
    "vol24": 8249805046,
    "marketCap": 64034914154,
    "provider": "coingecko",
    "providerURL": "https://www.coingecko.com/en/coins/usd-coin"
  },
  "assets": {
    "name": "USD Coin",
    "type": "ARBITRUM",
    "symbol": "USDC",
    "decimals": 6,
    "website": "https://www.centre.io/usdc",
    "description": "USDC is a fully collateralized US Dollar stablecoin developed by CENTRE, the open source project with Circle being the first of several forthcoming issuers.",
    "explorer": "https://arbiscan.io/token/0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    "status": "active",
    "id": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "links": [
      {
        "name": "coinmarketcap",
        "url": "https://coinmarketcap.com/currencies/usd-coin/"
      },
      {
        "name": "coingecko",
        "url": "https://coingecko.com/coins/usd-coin/"
      },
      {
        "name": "blog",
        "url": "https://centre.io/blog"
      }
    ],
    "tags": ["stablecoin"]
  }
}
```

and then join the results.

**YOUR TASK**: verify that these two APIs will provide all the necessary data to replace Moralis API in the api/ backend completely?
