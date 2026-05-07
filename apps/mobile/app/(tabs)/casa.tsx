import { Placeholder } from "@/src/components/Placeholder";
import { useI18n } from "@/src/hooks/useI18n";

export default function CasaScreen() {
  const { t } = useI18n();
  return <Placeholder icon="home-outline" title="Casa" sub={t("eyebrow_casa")} />;
}
