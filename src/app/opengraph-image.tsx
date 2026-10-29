import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "mbioTraders live market signal analysis";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
      background: "linear-gradient(135deg, #03111a 0%, #062e30 62%, #061926 100%)", color: "#eaf5f4",
      padding: "65px 72px", fontFamily: "Arial, sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ width: 16, height: 16, borderRadius: 16, background: "#29e4a7", boxShadow: "0 0 36px #29e4a7" }} />
        <span style={{ fontSize: 26, letterSpacing: 2, color: "#b7d4ce" }}>LIVE MARKET SIGNALS</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "baseline", fontSize: 88, fontWeight: 800, letterSpacing: -5 }}>mbio<span style={{ color: "#27e3a4" }}>Traders</span></div>
        <div style={{ marginTop: 17, fontSize: 35, color: "#c1dad7" }}>Gold & Forex · Technical Analysis</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 22, color: "#95cfc0" }}>
        <span>Strength Gauge</span><span>•</span><span>Multi-Timeframe Trend</span><span>•</span><span>Signal Alerts</span>
      </div>
    </div>, size,
  );
}
