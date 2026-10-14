import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Link, Routes, Route, useLocation } from 'react-router';
import { WalletProvider } from './adapters/wallet';
import { NavBar } from './components/NavBar';
import { Footer } from './components/Footer';
import { EmptyState, LoadingState, Page } from './components/primitives';
import { LandingView } from './views/LandingView';

const view = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const CatalogueView = view(() => import('./views/CatalogueView'), 'CatalogueView');
const ArtworkView = view(() => import('./views/ArtworkView'), 'ArtworkView');
const PortfolioView = view(() => import('./views/PortfolioView'), 'PortfolioView');
const MintView = view(() => import('./views/MintView'), 'MintView');
const GalleryDashboardView = view(
  () => import('./views/GalleryDashboardView'),
  'GalleryDashboardView',
);
const AdminView = view(() => import('./views/AdminView'), 'AdminView');
const VerifyView = view(() => import('./views/VerifyView'), 'VerifyView');
const TransparencyView = view(() => import('./views/TransparencyView'), 'TransparencyView');
const GalleryInfoView = view(() => import('./views/GalleryInfoView'), 'GalleryInfoView');

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <Page>
      <EmptyState
        title="Η σελίδα δεν βρέθηκε"
        action={
          <Link
            to="/"
            className="mt-2 border border-[hsl(var(--accent))] text-[hsl(var(--accent))] px-4 py-1.5 text-[13px]"
          >
            Αρχική
          </Link>
        }
      />
    </Page>
  );
}

// A new key per path replays the enter animation
function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <div className="flex min-h-screen flex-col">
        <ScrollToTop />
        <NavBar />
        <main className="flex-1">
          <PageTransition>
            <Suspense
              fallback={
                <Page>
                  <LoadingState />
                </Page>
              }
            >
              <Routes>
                <Route path="/" element={<LandingView />} />
                <Route path="/catalogue" element={<CatalogueView />} />
                <Route path="/artwork/:id" element={<ArtworkView />} />
                <Route path="/verify" element={<VerifyView />} />
                <Route path="/verify/:id" element={<VerifyView />} />
                <Route path="/transparency" element={<TransparencyView />} />
                <Route path="/galleries" element={<GalleryInfoView />} />
                <Route path="/portfolio" element={<PortfolioView />} />
                <Route path="/mint" element={<MintView />} />
                <Route path="/gallery" element={<GalleryDashboardView />} />
                <Route path="/admin" element={<AdminView />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </PageTransition>
        </main>
        <Footer />
      </div>
    </WalletProvider>
  );
}
