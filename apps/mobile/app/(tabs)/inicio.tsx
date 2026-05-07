import { Placeholder } from "@/src/components/Placeholder";
import { useI18n } from "@/src/hooks/useI18n";

export default function InicioScreen() {
  const { t } = useI18n();
  return <Placeholder icon="create-outline" title={t("empty_inicio_title")} sub={t("empty_inicio_sub")} />;
}
