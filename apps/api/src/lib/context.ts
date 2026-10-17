import { AsyncLocalStorage } from 'node:async_hooks';

/** The company a signed-in request works for. Outside a request (jobs, sign-in, report links) there is none: "system". */
export const requestContext = new AsyncLocalStorage<{ companyId: string }>();
export const currentCompany = () => requestContext.getStore()?.companyId ?? null;
