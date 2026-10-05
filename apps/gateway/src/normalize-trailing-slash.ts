import type { MiddlewareHandler } from "hono";
export const normalizeTrailingSlashMiddleware: MiddlewareHandler = async (c, next) => {
  const url = new URL(c.req.url);
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
    return c.redirect(`${url.pathname}${url.search}`, 301);
  }
  return next();
};
