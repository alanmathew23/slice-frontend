import { createElement } from "react"
import { createBrowserRouter, redirect } from "react-router"
import Auth from "./pages/Auth"
import Groups from "./pages/Groups"
import GroupDetail from "./pages/GroupDetail"
import JoinInvite from "./pages/JoinInvite"
import { ProtectedRoute } from "./ProtectedRoute"

export const router = createBrowserRouter([
  { index: true, Component: Auth },
  {
    path: "groups",
    Component: () => createElement(ProtectedRoute, null, createElement(Groups)),
  },
  {
    path: "groups/:groupId",
    Component: () => createElement(ProtectedRoute, null, createElement(GroupDetail)),
  },
  // Public — must be reachable by someone who isn't signed in yet.
  { path: "join/:token", Component: JoinInvite },
  { path: "*", loader: () => redirect("/") },
])
