import { Placeholder } from "@/src/components/Placeholder";
import { useI18n } from "@/src/hooks/useI18n";

export default function RecetasScreen() {
  const { t } = useI18n();
  return <Placeholder icon="book-outline" title={t("empty_recetas_title")} sub={t("empty_recetas_sub")} />;
}
