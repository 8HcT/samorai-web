import { Skeleton, SkeletonText } from '~/components/ui/Skeleton';

function Head() {
  return (
    <div className="admin-pagehead">
      <div style={{ width: '100%' }}>
        <Skeleton width={180} height={30} />
        <div style={{ marginTop: 10, maxWidth: 520 }}><SkeletonText lines={1} /></div>
      </div>
    </div>
  );
}

function Rows({ count = 6, cols = 5 }: { count?: number; cols?: number }) {
  return (
    <section className="admin-section">
      <Skeleton width={160} height={18} />
      <div style={{ display: 'grid', gap: 18, marginTop: 20 }}>
        {Array.from({ length: count }, (_, r) => (
          <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 16, alignItems: 'center' }}>
            {Array.from({ length: cols }, (_, c) => (
              <Skeleton key={c} width={c === 0 ? '70%' : c === cols - 1 ? '50%' : '85%'} height={c === 0 ? 16 : 14} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Kpis() {
  return (
    <section className="admin-section">
      <Skeleton width={90} height={18} />
      <div className="viz-kpis" style={{ marginTop: 16 }}>
        <div className="viz-hero"><Skeleton width="40%" height={14} /><Skeleton width="70%" height={44} style={{ marginTop: 12 }} /></div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="viz-tile"><Skeleton width="60%" height={13} /><Skeleton width="40%" height={26} style={{ marginTop: 10 }} /></div>
        ))}
      </div>
    </section>
  );
}

/**
 * Esqueleto de la pantalla del panel que se está abriendo. Se muestra
 * mientras llegan sus datos para que el cambio se note al instante.
 */
export function AdminPageSkeleton({ path }: { path: string }) {
  const p = path.replace(/\/+$/, '');
  let body;
  if (p === '/admin') body = (<><Kpis /><Rows count={5} cols={6} /></>);
  else if (/^\/admin\/(pedidos|reservas)\/[^/]+$/.test(p)) {
    body = (
      <>
        <div className="admin-grid-2">
          <section className="admin-section"><Skeleton width={120} height={18} /><div style={{ marginTop: 16 }}><SkeletonText lines={4} /></div></section>
          <section className="admin-section"><Skeleton width={140} height={18} /><div style={{ marginTop: 16 }}><SkeletonText lines={5} /></div></section>
        </div>
        <Rows count={3} cols={4} />
      </>
    );
  } else if (p === '/admin/estado') {
    body = <Rows count={8} cols={3} />;
  } else body = <Rows count={7} cols={5} />;

  return (
    <div role="status" aria-label="Cargando…">
      <Head />
      {body}
    </div>
  );
}
