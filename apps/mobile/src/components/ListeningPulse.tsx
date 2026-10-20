// A ring that pulses around the microphone while it listens, so the chef can see that
// dictation is on. The ring stays still when the system reduces motion.
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useReduceMotion } from "@/src/hooks/useReduceMotion";

type Props = {
  active: boolean;
  // The microphone button's diameter: the ring starts at its edge.
  size: number;
  color: string;
  children: ReactNode;
};

export function ListeningPulse({ active, size, color, children }: Props) {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    if (!active || reduceMotion !== false) return;
    const pulse = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: 1200, useNativeDriver: true }),
    );
    pulse.start();
    return () => pulse.stop();
  }, [active, reduceMotion, progress]);

  return (
    <View style={{ width: size, height: size }}>
      {active ? (
        <Animated.View
          testID="listening-ring"
          pointerEvents="none"
          style={[
            styles.ring,
            {
              borderRadius: size / 2,
              borderColor: color,
              opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
              transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
            },
          ]}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderWidth: 2 },
});
