// src/lib/authCleanup.js
import AsyncStorage from "@react-native-async-storage/async-storage";

export function isInvalidRefreshTokenError(err) {
  const msg = String(err?.message || err || "");
  return (
    msg.includes("Invalid Refresh Token") ||
    msg.includes("Refresh Token Not Found")
  );
}

export async function cleanupInvalidRefreshToken() {
  try {
    // Supabase v2 συνήθως γράφει εδώ:
    await AsyncStorage.multiRemove([
      "sb-xhjwxejxumodccdimpga-auth-token",
      "supabase.auth.token",
    ]);
  } catch (_) {}
}
