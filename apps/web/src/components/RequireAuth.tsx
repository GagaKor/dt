import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { useMe } from '../api/queries';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const me = useMe();
  if (me.isPending) return <p className="p-6 text-slate-500">{t('app.loading')}</p>;
  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401)
      return <Navigate to="/login" replace />;
    return <p className="p-6 text-red-600">{t('login.error')}</p>;
  }
  return <>{children}</>;
}
