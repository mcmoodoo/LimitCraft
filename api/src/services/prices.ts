interface PriceResponse {
  [tokenAddress: string]: string;
}

async function fetchPriceWithGET(
  tokenAddress: string,
  chainId: number,
  apiKey: string
): Promise<{ success: boolean; price?: string; error?: string }> {
  try {
    const response = await fetch(
      `https://api.1inch.dev/price/v1.1/${chainId}/${tokenAddress}?currency=USD`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `GET request failed: ${response.status} ${errorText}`,
      };
    }

    const data = (await response.json()) as Record<string, string>;
    return {
      success: true,
      price: data[tokenAddress],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function fetchPricesWithPOST(
  tokenAddresses: string[],
  chainId: number,
  apiKey: string
): Promise<{ success: boolean; data?: PriceResponse; error?: string }> {
  try {
    const response = await fetch(`https://api.1inch.dev/price/v1.1/${chainId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tokens: tokenAddresses,
        currency: 'USD',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `POST request failed: ${response.status} ${errorText}`,
      };
    }

    const data = (await response.json()) as PriceResponse;
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function fetchPricesFrom1inch(
  tokenAddresses: string[],
  chainId: number
): Promise<{ success: boolean; data?: PriceResponse; error?: string }> {
  try {
    const oneInchApiKey = process.env.ONE_INCH_API_KEY;

    if (!oneInchApiKey) {
      return {
        success: false,
        error: 'ONE_INCH_API_KEY is not configured',
      };
    }

    // Try GET requests first (one for each token)
    const getResults = await Promise.all(
      tokenAddresses.map((token) => fetchPriceWithGET(token, chainId, oneInchApiKey))
    );

    // Check if all GET requests succeeded
    const allGETsSucceeded = getResults.every((result) => result.success);

    if (allGETsSucceeded) {
      // Combine results into single response object
      const priceData: PriceResponse = {};
      tokenAddresses.forEach((address, index) => {
        if (getResults[index].price) {
          priceData[address] = getResults[index].price!;
        }
      });

      return {
        success: true,
        data: priceData,
      };
    }

    // If GET requests failed, fallback to POST
    console.log('GET requests failed, falling back to POST endpoint');
    const postResult = await fetchPricesWithPOST(tokenAddresses, chainId, oneInchApiKey);

    if (postResult.success) {
      return postResult;
    }

    // Both methods failed
    return {
      success: false,
      error: 'Both GET and POST methods failed to fetch prices',
    };
  } catch (error) {
    console.error('Error fetching prices from 1inch:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
