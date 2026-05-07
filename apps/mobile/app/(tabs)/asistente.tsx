import { Screen } from "@/src/components/Screen";
import { Placeholder } from "@/src/components/Placeholder";
import { useI18n } from "@/src/hooks/useI18n";

export default function AsistenteScreen() {
  const { t } = useI18n();
  return (
    <Screen title={t("header_asistente")}>
      <Placeholder icon="chatbubble-outline" title={t("empty_chat_title")} sub={t("empty_chat_sub")} />
    </Screen>
  );
}
