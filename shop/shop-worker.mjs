import {googleAuthRoute} from './google-auth.mjs';
import {accountOrderRoute} from './account-orders.mjs';

export default {
  async fetch(request, env) {
    try {
      const response = await googleAuthRoute(request, env) ?? await accountOrderRoute(request, env);
      if (response) return response;
      const url = new URL(request.url);
      if (url.pathname === '/buy') {
        url.pathname = '/shop/index.html';
        return env.ASSETS.fetch(new Request(url, request));
      }
      return env.ASSETS.fetch(request);
    } catch {
      return Response.json({error: 'Shop temporarily unavailable'}, {
        status: 503, headers: {'Cache-Control': 'no-store'}
      });
    }
  }
};
