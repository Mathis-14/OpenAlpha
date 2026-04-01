"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import AuthModal from "@/components/auth/auth-modal";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function mapFirebaseError(error: unknown): string {
  const code =
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";

  switch (code) {
    case "auth/account-exists-with-different-credential":
      return "An account already exists with a different sign-in method.";
    case "auth/email-already-in-use":
      return "This email is already in use.";
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
      return "Incorrect email or password.";
    case "auth/user-not-found":
      return "No account was found for this email.";
    case "auth/popup-closed-by-user":
      return "The sign-in popup was closed before completion.";
    case "auth/popup-blocked":
      return "The sign-in popup was blocked by your browser.";
    case "auth/too-many-requests":
      return "Too many login attempts. Try again later.";
    case "auth/weak-password":
      return "Choose a stronger password.";
    default:
      return error instanceof Error ? error.message : "Authentication failed.";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, [configured]);

  const closeAuthModal = useCallback(() => {
    setModalOpen(false);
    setError(null);
  }, []);

  const openAuthModal = useCallback(() => {
    setError(null);
    setModalOpen(true);
  }, []);

  const runAuthAction = useCallback(async (action: () => Promise<void>) => {
    if (!configured) {
      setError("Firebase is not configured in this environment.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await action();
      setModalOpen(false);
    } catch (authError) {
      setError(mapFirebaseError(authError));
    } finally {
      setSubmitting(false);
    }
  }, [configured]);

  const signInWithGoogle = useCallback(async () => {
    await runAuthAction(async () => {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(getFirebaseAuth(), provider);
    });
  }, [runAuthAction]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await runAuthAction(async () => {
      await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
    });
  }, [runAuthAction]);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    await runAuthAction(async () => {
      await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
    });
  }, [runAuthAction]);

  const signOut = useCallback(async () => {
    if (!configured) {
      return;
    }

    await firebaseSignOut(getFirebaseAuth());
  }, [configured]);

  const getIdToken = useCallback(async () => {
    if (!configured) {
      return null;
    }

    return getFirebaseAuth().currentUser
      ? await getFirebaseAuth().currentUser!.getIdToken()
      : null;
  }, [configured]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    configured,
    openAuthModal,
    closeAuthModal,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    getIdToken,
  }), [
    user,
    loading,
    configured,
    openAuthModal,
    closeAuthModal,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    getIdToken,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {modalOpen ? (
        <AuthModal
          open={modalOpen}
          onOpenChange={(open) => {
            if (!open) {
              closeAuthModal();
              return;
            }

            openAuthModal();
          }}
          onGoogleSignIn={signInWithGoogle}
          onEmailSignIn={signInWithEmail}
          onEmailSignUp={signUpWithEmail}
          loading={submitting}
          error={error}
          configured={configured}
        />
      ) : null}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
