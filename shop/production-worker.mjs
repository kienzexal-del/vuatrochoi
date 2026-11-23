import {steamPaymentRoute} from './steam-payments.mjs';

export default {
  async fetch(request, env) {
    try {
      const response = await steamPaymentRoute(request, env);
      if (response) return response;
      return env.ASSETS.fetch(request);
    } catch {
      return Response.json({ok: false, error: 'TEMPORARILY_UNAVAILABLE'}, {
        status: 503, headers: {'Cache-Control': 'no-store'}
      });
    }
  }
};
