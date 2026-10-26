import { HashRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';

/* The per-type lists (MTM concepts, option requests, RTW requirements) folded
   into Design requirements. Their links live on in alerts, threads and saved
   views, so each old path lands on the merged screen with the same record
   open and the kind pre-selected. */
function ToDesign({ kind, form }: { kind: 'MTM' | 'Options' | 'RTW'; form: 'mtm' | 'options' | 'rtw' }) {
  const [p] = useSearchParams();
  const q = new URLSearchParams(p); q.set('kind', kind);
  if (q.get('new') === '1') q.set('new', form);
  return <Navigate to={`/design?${q.toString()}`} replace />;
}
import { Shell, homeFor } from './layout/Shell';
import { useApp } from './store';
import { Sourcing } from './screens/Sourcing';
import { Tracker } from './screens/Tracker';
import { Factory } from './screens/Factory';
import { Mtm } from './screens/Mtm';
import { VendorsPage } from './screens/Vendors';
import { OutboundPage } from './screens/Outbound';
import { Swatches } from './screens/Swatches';
import { DesignHome } from './screens/DesignHome';
import { Otif } from './screens/Otif';
import { Warehouse } from './screens/Warehouse';
import { Stores } from './screens/Stores';
import { Launches } from './screens/Launches';
import { Insights } from './screens/Insights';
import { GrnPage } from './screens/Warehouse';
import { Health } from './screens/Health';
import { Planning } from './screens/Planning';
import { Fabrics, FabricPage } from './screens/Fabrics';
import { DesignsPage } from './screens/Designs';
import { MTM_ONLY, OPTIONS_OFF } from './domain/edition';

/* No Today screen: each role lands on the first screen it works in. */
function Landing() {
  const { role } = useApp();
  return <Navigate to={homeFor(role)} replace />;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Landing />} />
          <Route path="/requests" element={OPTIONS_OFF ? <Navigate to="/design" replace /> : <ToDesign kind="Options" form="options" />} />
          <Route path="/requirements" element={MTM_ONLY ? <Navigate to="/design" replace /> : <ToDesign kind="RTW" form="rtw" />} />
          <Route path="/sourcing" element={<Sourcing />} />
          <Route path="/tracker" element={MTM_ONLY ? <Navigate to="/" replace /> : <Tracker />} />
          <Route path="/factory" element={<Factory />} />
          <Route path="/mtm" element={<Mtm />} />
          <Route path="/outbound" element={<OutboundPage />} />
          <Route path="/otif" element={MTM_ONLY ? <Navigate to="/" replace /> : <Otif />} />
          <Route path="/warehouse" element={MTM_ONLY ? <Navigate to="/" replace /> : <Warehouse />} />
          <Route path="/stores" element={<Stores />} />
          <Route path="/health" element={MTM_ONLY ? <Navigate to="/" replace /> : <Health />} />
          <Route path="/planning" element={MTM_ONLY ? <Navigate to="/" replace /> : <Planning />} />
          <Route path="/launches" element={MTM_ONLY ? <Navigate to="/" replace /> : <Launches />} />
          <Route path="/insights" element={MTM_ONLY ? <Navigate to="/" replace /> : <Insights />} />
          <Route path="/grn" element={MTM_ONLY ? <Navigate to="/" replace /> : <GrnPage />} />
          <Route path="/concepts" element={<ToDesign kind="MTM" form="mtm" />} />
          <Route path="/swatches" element={<Swatches />} />
          <Route path="/design" element={<DesignHome />} />
          <Route path="/fabrics" element={<Fabrics />} />
          <Route path="/fabric/:id" element={<FabricPage />} />
          <Route path="/designs" element={<DesignsPage />} />
          <Route path="/vendors" element={<VendorsPage only="factories" />} />
          <Route path="/mills" element={<VendorsPage only="mills" />} />
        </Route>
          <Route path="*" element={<Navigate to="/" replace />} />   {/* a link to a screen that no longer exists lands on your home */}
      </Routes>
    </HashRouter>
  );
}
