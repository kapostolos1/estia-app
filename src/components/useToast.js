import { useRef, useState } from "react";
import { Animated } from "react-native";

export function useToast() {
  const [msg, setMsg] = useState("");
  const [visible, setVisible] = useState(false);
  const y = useRef(new Animated.Value(20)).current;
  const o = useRef(new Animated.Value(0)).current;

  function show(text, ms = 2200) {
    setMsg(text);
    setVisible(true);

    y.setValue(20);
    o.setValue(0);

    Animated.parallel([
      Animated.timing(y, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(y, { toValue: 20, duration: 180, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(() => setVisible(false));
    }, ms);
  }

  const Toast = () => {
    if (!visible) return null;
    return (
      <Animated.View
        style={{
          position: "absolute",
          left: 18,
          right: 18,
          bottom: 18,
          padding: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#0F3A27",
          backgroundColor: "#062417",
          opacity: o,
          transform: [{ translateY: y }],
        }}
      >
        <Animated.Text style={{ color: "#D1FAE5", fontWeight: "900" }}>{msg}</Animated.Text>
      </Animated.View>
    );
  };

  return { show, Toast };
}
