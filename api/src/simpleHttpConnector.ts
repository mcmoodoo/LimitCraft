export class SimpleHttpConnector {
  async get<T>(url: string, headers?: Record<string, string>): Promise<T> {
    try {
      const response = await fetch(url, { method: 'GET', headers });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP GET error! status: ${response.status}, response: ${errorText}`);
      }
      return response.json() as T;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch ${url}: ${error.message}`);
      }
      throw error;
    }
  }

  async post<T>(url: string, data: unknown, headers?: Record<string, string>): Promise<T> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP POST error! status: ${response.status}, response: ${errorText}`);
      }
      return response.json() as T;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to post to ${url}: ${error.message}`);
      }
      throw error;
    }
  }
}