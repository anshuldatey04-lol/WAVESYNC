import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QrCodeCardProps {
  value: string;
  size?: number;
}

export default function QrCodeCard({ value, size = 180 }: QrCodeCardProps) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 1, width: size * 2 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md" data-testid="qr-code">
      {dataUrl ? (
        <img src={dataUrl} alt={`Room QR code ${value}`} width={size} height={size} className="h-auto w-full rounded-xl" />
      ) : (
        <div className="animate-pulse rounded-xl bg-white/10" style={{ height: size }} />
      )}
      <p className="mt-3 truncate text-center font-mono text-xs text-slate-400">{value}</p>
    </div>
  );
}
