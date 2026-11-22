import {googleAuthRoute} from './google-auth.mjs';

// Smoke-test the Google round trip separately from production checkout.
export default {
  async fetch(request, env) {
    const result = await googleAuthRoute(request, env);
    if (result) return result;
    const url = new URL(request.url);
    if (url.pathname !== '/buy' && url.pathname !== '/') return new Response('Not found', {status: 404});
    return new Response(
      '<!doctype html><html lang="vi"><meta charset="utf-8"><title>Kiểm tra đăng nhập Google</title>' +
      '<h1>Kiểm tra đăng nhập Google</h1><p><a href="/auth/login">Đăng nhập bằng Google</a></p>' +
      '<p><a href="/api/me">Kiểm tra phiên đăng nhập</a></p></html>',
      {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}}
    );
  }
};
