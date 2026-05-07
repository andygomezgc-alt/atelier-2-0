import { Placeholder } from "@/src/components/Placeholder";
import { useI18n } from "@/src/hooks/useI18n";

export default function AsistenteScreen() {
  const { t } = useI18n();
  return <Placeholder icon="chatbubble-outline" title={t("empty_chat_title")} sub={t("empty_chat_sub")} />;
}
