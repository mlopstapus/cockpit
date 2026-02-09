/**
 * ANSI color code parser
 * Converts ANSI escape sequences to styled segments
 */
// ANSI color codes to CSS color mapping
const ANSI_COLORS = {
    30: "#808080", // black -> gray
    31: "#ff6b6b", // red
    32: "#51cf66", // green
    33: "#ffd43b", // yellow
    34: "#74c0fc", // blue
    35: "#ff8cc3", // magenta
    36: "#00d9ff", // cyan
    37: "#f1f3f5", // white -> light gray
    90: "#5c5c5c", // bright black
    91: "#ff8787", // bright red
    92: "#69db7c", // bright green
    93: "#ffe066", // bright yellow
    94: "#91a7ff", // bright blue
    95: "#ff99cc", // bright magenta
    96: "#00e9ff", // bright cyan
    97: "#ffffff", // bright white
};
const BG_COLORS = {
    40: "#000000",
    41: "#800000",
    42: "#008000",
    43: "#808000",
    44: "#000080",
    45: "#800080",
    46: "#008080",
    47: "#c0c0c0",
    100: "#808080",
    101: "#ff0000",
    102: "#00ff00",
    103: "#ffff00",
    104: "#0000ff",
    105: "#ff00ff",
    106: "#00ffff",
    107: "#ffffff",
};
export function parseANSI(text) {
    const segments = [];
    // Remove ANSI codes and track styles
    const ansiRegex = /\x1b\[([0-9;]*)?m/g;
    let lastIndex = 0;
    let currentStyles = {
        bold: false,
        color: undefined,
        bgColor: undefined,
        underline: false,
        dim: false,
    };
    let match;
    const regex = new RegExp(ansiRegex);
    while ((match = regex.exec(text)) !== null) {
        // Add text before this code
        if (match.index > lastIndex) {
            const segment = text.substring(lastIndex, match.index);
            if (segment) {
                segments.push({
                    text: segment,
                    ...currentStyles,
                });
            }
        }
        // Parse the ANSI code
        const codes = match[1]?.split(";").map(Number) || [0];
        codes.forEach((code) => {
            switch (code) {
                case 0:
                    // Reset all
                    currentStyles = {
                        bold: false,
                        color: undefined,
                        bgColor: undefined,
                        underline: false,
                        dim: false,
                    };
                    break;
                case 1:
                    currentStyles.bold = true;
                    break;
                case 2:
                    currentStyles.dim = true;
                    break;
                case 4:
                    currentStyles.underline = true;
                    break;
                default:
                    // Check if it's a color code
                    if (ANSI_COLORS[code]) {
                        currentStyles.color = ANSI_COLORS[code];
                    }
                    else if (BG_COLORS[code]) {
                        currentStyles.bgColor = BG_COLORS[code];
                    }
            }
        });
        lastIndex = match.index + match[0].length;
    }
    // Add remaining text
    if (lastIndex < text.length) {
        segments.push({
            text: text.substring(lastIndex),
            ...currentStyles,
        });
    }
    return segments;
}
