import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { SWRConfig } from "swr";

import { AuthProvider } from "@/lib/auth";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SWRConfig value={{ revalidateOnFocus: false }}>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </SWRConfig>
  );
}
