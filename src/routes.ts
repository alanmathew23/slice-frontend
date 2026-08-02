import { createElement } from "react"
import { createBrowserRouter, redirect } from "react-router"
import Auth from "./pages/Auth"
import Groups from "./pages/Groups"
import GroupDetail from "./pages/GroupDetail"
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
  { path: "*", loader: () => redirect("/") },
])
