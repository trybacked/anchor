import { AsyncLocalStorage } from "node:async_hooks";
export type RequestContext = {
  user?: string | undefined;
  tenant?: string | undefined;
};
const storage = new AsyncLocalStorage<RequestContext>();
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}
export async function withRequestContext<T>(
  context: RequestContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  return await storage.run(context, fn);
}
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
