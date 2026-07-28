import type http from 'node:http';

export function parseBody<T>(request: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        request.destroy();
        reject(new Error('Request body too large'));
      }
    });
    request.on('end', () => {
      if (!body) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(body) as T);
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function send(response: http.ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

export function listResponse<T>(items: T[], url: URL, filter: (item: T) => boolean = () => true) {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const pageSize = Math.max(1, Number(url.searchParams.get('pageSize') ?? 10));
  const filtered = items.filter(filter);
  return {
    list: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    page,
    pageSize,
  };
}

export function includes(value: unknown, keyword: string) {
  return String(value ?? '').toLowerCase().includes(keyword.toLowerCase());
}
