// pages/index.js
import { useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "@/utils/supabase";
export default function IndexPage() {
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (isMounted && data?.user) {
        router.push("/home");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          process.env.NODE_ENV === "development"
            ? "http://localhost:3000/home"
            : "https://yourdomain.com/home", // replace with your real domain
      },
    });

    if (error) {
      console.error("Login error:", error.message);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "black",
        color: "white",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      <h1 style={{ fontSize: "3rem", marginBottom: "2rem" }}>
        Welcome to Gunsmoke3D
      </h1>
      <button
        onClick={signInWithGoogle}
        style={{
          background: "#db4437",
          border: "none",
          padding: "1rem 2rem",
          borderRadius: "0.5rem",
          color: "white",
          fontSize: "1.1rem",
          cursor: "pointer",
        }}
      >
        Sign in with Google
      </button>
    </div>
  );
}
