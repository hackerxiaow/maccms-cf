import worker from '../src/index.ts';
import type { Bindings } from '../src/types/index.ts';

// Pages Functions catch-all adapter. The shared Hono worker handles API and
// dynamic routes, then uses Pages' default ASSETS binding for public files.
export const onRequest: PagesFunction<Bindings> = (context) =>
  worker.fetch(context.request, context.env, context);
