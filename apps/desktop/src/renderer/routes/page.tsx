import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: RootIndexPage,
});

// Hoisted for stable props identity - <Navigate> re-navigates every re-render otherwise (react error #185 loop, #5729)
// boot straight into Home instead of the stock hub.
const workspaceRedirect = <Navigate to="/home" replace />;

function RootIndexPage() {
	return workspaceRedirect;
}
