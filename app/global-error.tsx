"use client";

// Last-resort boundary for errors in the root layout itself. It replaces
// the whole document, so it can't rely on fonts, i18n or Tailwind theme
// tokens being available.
export default function GlobalError({ unstable_retry }: { unstable_retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "#060805",
          color: "#f2f5ef",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <title>HighKick</title>
        <p style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Something broke</p>
        <button
          onClick={() => unstable_retry()}
          style={{
            border: "1px solid #53fc18",
            background: "transparent",
            color: "#53fc18",
            padding: "8px 20px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
