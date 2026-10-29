import { DashboardSkeletonCards } from "@/components/DashboardSkeleton";

export default function Loading() {
  return <main className="mbiotraders-page">
    <header className="mbiotraders-header"><div className="mbiotraders-branding"><h1><a href="https://mbiopeter.co.ke" target="_blank" rel="noopener noreferrer" aria-label="Visit the mbioPeter portfolio">mbio<span>Traders</span></a></h1><p>Real-Time Market Signals</p></div></header>
    <div className="mbiotraders-loading-toolbar"><span className="mbiotraders-skeleton-block"/><span className="mbiotraders-skeleton-block"/></div>
    <DashboardSkeletonCards />
  </main>;
}
