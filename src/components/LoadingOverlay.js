import React from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";

export default function LoadingOverlay({ visible, text = "Φόρτωση..." }) {
  if (!visible) return null;

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <ActivityIndicator size="large" />
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 999,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#072A1C",
    borderWidth: 1,
    borderColor: "#0F3A27",
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    gap: 12,
  },
  text: { color: "#D1FAE5", fontWeight: "900" },
});
