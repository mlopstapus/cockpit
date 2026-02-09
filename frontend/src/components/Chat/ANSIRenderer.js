import { jsx as _jsx } from "react/jsx-runtime";
import { parseANSI } from "../../lib/ansi";
export function ANSIRenderer({ text, className = "" }) {
    const segments = parseANSI(text);
    return (_jsx("span", { className: className, children: segments.map((segment, i) => {
            const style = {
                color: segment.color,
                backgroundColor: segment.bgColor,
                fontWeight: segment.bold ? "bold" : "normal",
                opacity: segment.dim ? 0.7 : 1,
                textDecoration: segment.underline ? "underline" : "none",
            };
            return (_jsx("span", { style: style, children: segment.text }, i));
        }) }));
}
