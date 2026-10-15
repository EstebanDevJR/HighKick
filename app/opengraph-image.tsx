import { ImageResponse } from "next/og";

export const alt = "HighKick — the best Kick clips in a vertical feed";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Default share card for every page that doesn't set its own image (clip
// and channel pages use a clip thumbnail instead). Drawn with system fonts
// so it renders without fetching anything at request time.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "radial-gradient(circle at 80% 20%, #1c3d0f 0%, #060805 55%)",
          color: "#f2f5ef",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "#53fc18",
              color: "#060805",
              padding: "10px 22px",
              fontSize: 72,
              fontWeight: 800,
            }}
          >
            <svg width="56" height="56" viewBox="0 0 24 24" fill="#060805">
              <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
            </svg>
            HIGH
          </div>
          <div style={{ fontSize: 72, fontWeight: 800 }}>KICK</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 44, fontWeight: 700, maxWidth: 900, lineHeight: 1.2 }}>
          The best Kick clips, in a vertical feed.
        </div>
        <div style={{ marginTop: 20, fontSize: 28, color: "#9aa596" }}>
          MIX · Following · Explore · Live badges · Open source
        </div>
      </div>
    ),
    size,
  );
}
