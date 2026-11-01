
import type { ReactNode } from "react";

function Stripe({ width = "100%", height = 12, className = "" }: { width?: string; height?: number; className?: string }) {
  return <span className={`mbiotraders-skeleton-block ${className}`} style={{ width, height }} aria-hidden="true" />;
}
function Card({ area, children }: { area: string; children: ReactNode }) {
  return <section className={`mbiotraders-card mbiotraders-${area}-card mbiotraders-skeleton-card`}>{children}</section>;
}
function SkeletonHeading({ width = "62%" }: { width?: string }) {
  return <div className="mbiotraders-skeleton-heading"><Stripe width={width} height={16} /></div>;
}
export function DashboardSkeletonCards() {
  return (
    <div className="mbiotraders-grid mbiotraders-skeleton-grid" role="status" aria-label="Loading live market analysis" aria-live="polite">
      <span className="sr-only">Loading verified market candles, indicators and signals</span>
      <Card area="chart">
        <SkeletonHeading width="48%" />
        <div className="mbiotraders-chart-skeleton">
          {Array.from({length:22}, (_, i) => <Stripe key={i} className="mbiotraders-chart-stick" height={28 + ((i * 13) % 82)} width="11px" />)}
        </div>
        <div className="mbiotraders-skeleton-inline"><Stripe width="24%" /><Stripe width="35%" /><Stripe width="18%" /></div>
      </Card>
      <Card area="gauge"><SkeletonHeading width="74%"/><div className="mbiotraders-gauge-skeleton"/><Stripe width="34%" height={26}/><div className="mbiotraders-skeleton-inline"><Stripe width="25%"/><Stripe width="25%"/><Stripe width="25%"/></div></Card>
      <Card area="signal"><SkeletonHeading width="60%"/><Stripe className="mbiotraders-skeleton-signal" height={48}/><Stripe width="90%" height={9}/>{Array.from({length:6},(_,i)=><div key={i} className="mbiotraders-skeleton-line"><Stripe width="42%"/><Stripe width="29%"/></div>)}</Card>
      <Card area="align"><SkeletonHeading width="46%"/><div className="mbiotraders-skeleton-frames">{Array.from({length:6},(_,i)=><Stripe key={i} height={92}/>)}</div></Card>
      <Card area="setup"><SkeletonHeading width="62%"/>{Array.from({length:5},(_,i)=><div key={i} className="mbiotraders-skeleton-line"><Stripe width="71%"/><Stripe width="16%"/></div>)}</Card>
      <Card area="levels"><SkeletonHeading width="55%"/>{Array.from({length:5},(_,i)=><div key={i} className="mbiotraders-skeleton-line"><Stripe width="48%"/><Stripe width="30%"/></div>)}</Card>
      <Card area="tech"><SkeletonHeading width="56%"/><div className="mbiotraders-skeleton-frames">{Array.from({length:9},(_,i)=><Stripe key={i} height={30}/>)}</div></Card>
      <Card area="recent"><SkeletonHeading width="52%"/>{Array.from({length:4},(_,i)=><Stripe key={i} width="94%" height={23}/>)}</Card>
      <Card area="stats"><SkeletonHeading width="65%"/><div className="mbiotraders-skeleton-inline"><Stripe width="88px" height={88}/><div className="mbiotraders-skeleton-stats">{Array.from({length:5},(_,i)=><Stripe key={i} width="95%" height={11}/>)}</div></div></Card>
    </div>
  );
}
