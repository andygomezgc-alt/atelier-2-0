import { Placeholder } from "@/src/components/Placeholder";
import { useI18n } from "@/src/hooks/useI18n";

export default function MenusScreen() {
  const { t } = useI18n();
  return <Placeholder icon="list-outline" title={t("empty_menus_title")} sub={t("empty_menus_sub")} />;
}
