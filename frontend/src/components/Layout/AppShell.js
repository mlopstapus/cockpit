import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import BottomNav from "./BottomNav";
import StatusBar from "./StatusBar";
export default function AppShell({ children }) {
    return (_jsxs("div", { className: "flex h-screen flex-col bg-base text-white", children: [_jsx(StatusBar, {}), _jsx("main", { className: "flex-1 overflow-y-auto pb-20", children: children }), _jsx(BottomNav, {})] }));
}
