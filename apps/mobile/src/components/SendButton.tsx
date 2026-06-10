// apps/mobile/src/components/SendButton.tsx
// Botón de enviar del Asistente (opción C elegida por Andy):
//  - al enviar, la flecha "despega" (sube y desaparece, entra otra desde abajo)
//  - mientras streaming=true el botón late despacio (anillo que respira)
// En RN no hay box-shadow animable → el pulso es un View anillo con scale/opacity.

import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors } from "@/src/theme";

const SPRING = { damping: 14, stiffness: 170, mass: 0.8 };

type Props = {
  disabled: boolean;
  streaming: boolean;
  onPress: () => void;
};

export function SendButton({ disabled, streaming, onPress }: Props) {
  const flyY = useSharedValue(0);
  const flyOpacity = useSharedValue(1);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (streaming) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 700, easing: Easing.in(Easing.quad) }),
        ),
        -1,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200 });
    }
    return () => cancelAnimation(pulse);
  }, [streaming, pulse]);

  const handlePress = () => {
    // Despegue: sube y se desvanece (230ms), teletransporte abajo, vuelve con spring.
    flyY.value = withSequence(
      withTiming(-26, { duration: 230, easing: Easing.in(Easing.quad) }),
      withTiming(26, { duration: 0 }),
      withSpring(0, SPRING),
    );
    flyOpacity.value = withSequence(
      withTiming(0, { duration: 230 }),
      withTiming(1, { duration: 260 }),
    );
    onPress();
  };

  const arrowStyle = useAnimatedStyle(() => ({
    opacity: flyOpacity.value,
    transform: [{ translateY: flyY.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - pulse.value),
    transform: [{ scale: 1 + 0.45 * pulse.value }],
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
      <Pressable
        style={[styles.btn, disabled && styles.btnDisabled]}
        onPress={handlePress}
        disabled={disabled}
        accessibilityLabel="send"
      >
        <Animated.View style={arrowStyle}>
          <Ionicons name="send" size={16} color={colors.paper} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.terracota,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.terracota,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  btnDisabled: { opacity: 0.4 },
});
