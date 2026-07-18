import { createBrowserRouter } from "react-router";
import { Home } from "./pages/Home";
import { Rewards } from "./pages/Rewards";
import { History } from "./pages/History";
import { Layout } from "./components/Layout";
import { Welcome } from "./pages/Welcome";
import { Login } from "./pages/Login";
import { OTPVerification } from "./pages/OTPVerification";
import { Market } from "./pages/Market";
import { Products } from "./pages/Products";
import { Support } from "./pages/Support";
import { KnowledgeBase } from "./pages/KnowledgeBase";
import { About } from "./pages/About";
import { Legal } from "./pages/Legal";
import { NotRegistered } from "./pages/NotRegistered";

export const router = createBrowserRouter([
  { path: "/", Component: Welcome },
  { path: "/login", Component: Login },
  { path: "/otp", Component: OTPVerification },
  { path: "/not-registered", Component: NotRegistered },
  { path: "/knowledge-base", Component: KnowledgeBase },
  { path: "/about", Component: About },
  { path: "/legal/:type", Component: Legal },
  {
    path: "/app",
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: "rewards", Component: Rewards },
      { path: "market", Component: Market },
      { path: "products", Component: Products },
      { path: "history", Component: History },
      { path: "support", Component: Support },
    ],
  },
]);


