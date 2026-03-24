import { Octokit } from '@octokit/rest';

export class RateLimitError extends Error {
  constructor(waitMs) {
    super(`GitHub rate limit exceeded. Retry after ${waitMs}ms`);
    this.name = 'RateLimitError';
    this.waitMs = waitMs;
  }
}

export function createClient(token) {
  const etagCache = new Map();

  const octokit = new Octokit({ auth: token });

  octokit.hook.before('request', (options) => {
    const key = options.url || options.method;
    if (etagCache.has(key)) {
      options.headers = options.headers || {};
      options.headers['If-None-Match'] = etagCache.get(key);
    }
  });

  octokit.hook.after('request', (response, options) => {
    const etag = response.headers?.etag;
    if (etag) {
      const key = options.url || options.method;
      etagCache.set(key, etag);
    }
  });

  return octokit;
}
