import { lazy, Suspense } from 'react';
export default function dynamic(loader, options = {}) {
  const Component = lazy(async () => { const loaded = await loader(); return { default: loaded.default || loaded }; });
  const Loading = options.loading;
  return function Dynamic(props) { return <Suspense fallback={Loading ? <Loading /> : null}><Component {...props} /></Suspense>; };
}
