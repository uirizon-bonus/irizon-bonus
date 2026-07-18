import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "sonner";
import { PortalProvider } from "./context/PortalContext";
import { LanguageProvider } from "./contexts/LanguageContext";

export default function App() {
  return (
    <PortalProvider>
      <LanguageProvider>
        <RouterProvider router={router} />
        <Toaster position="top-center" richColors />
      </LanguageProvider>
    </PortalProvider>
  );
}


