import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Icône de l'app : casque audio sur fond blanc, coins arrondis, léger contour.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FFFFFF",
          borderRadius: 16,
          border: "2px solid #E7E2D8",
          fontSize: 36,
        }}
      >
        🎧
      </div>
    ),
    { ...size }
  );
}
