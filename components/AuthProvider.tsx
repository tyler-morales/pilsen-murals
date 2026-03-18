"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useAuthStore } from "@/store/authStore";
import { useCaptureStore } from "@/store/captureStore";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createClient();
    const captureStore = useCaptureStore.getState();

    const setSession = (user: ReturnType<typeof useAuthStore.getState>["user"]) => {
      useAuthStore.getState().setUser(user);
      if (user) {
        captureStore.setSupabaseClient(supabase);
        captureStore
          .syncLocalCapturesToServer(supabase)
          .then(() => captureStore.loadServerCaptures(supabase))
          .catch(() => { });
      } else {
        captureStore.setSupabaseClient(null);
      }
    };

    supabase.auth.getUser().then(({ data }) => {
      setSession(data.user ?? null);
      useAuthStore.getState().setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return <>{children}</>;
}
