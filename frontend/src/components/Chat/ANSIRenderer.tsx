import { parseANSI, type ANSISegment } from "../../lib/ansi";

interface ANSIRendererProps {
  text: string;
  className?: string;
}

export function ANSIRenderer({ text, className = "" }: ANSIRendererProps) {
  const segments = parseANSI(text);

  return (
    <span className={className}>
      {segments.map((segment: ANSISegment, i: number) => {
        const style: React.CSSProperties = {
          color: segment.color,
          backgroundColor: segment.bgColor,
          fontWeight: segment.bold ? "bold" : "normal",
          opacity: segment.dim ? 0.7 : 1,
          textDecoration: segment.underline ? "underline" : "none",
        };

        return (
          <span key={i} style={style}>
            {segment.text}
          </span>
        );
      })}
    </span>
  );
}
