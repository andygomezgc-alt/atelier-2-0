// Wraps a tab screen with a SafeArea + Header + body slot. Each tab uses
// this so the header is consistent without relying on Expo Router's
// per-tab header config (which fights with the design's transparent
// content area).

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Header } from "./Header";
import { ProfileSheet } from "./ProfileSheet";
import { useMockUser } from "@/src/state/mockUser";
import { colors } from "@/src/theme";

type Props = {
  title?: string;
  back?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
};

export function Screen({ title, back, onBack, right, children }: Props) {
  const user = useMockUser();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      <Header
        title={title}
        back={back}
        onBack={onBack}
        right={right}
        initials={user.initials}
        onAvatar={() => setProfileOpen(true)}
      />
      <View style={styles.body}>{children}</View>
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1, backgroundColor: colors.paper },
});
