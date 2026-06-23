import BrowseList from "@/components/BrowseList";

export default function ConcertsPage() {
  return (
    <BrowseList
      title="演唱會"
      apiType="concert"
      icon="🎤"
      iconBg="bg-rose-100"
      sourceLabels={{
        "culture-music": "文化部",
        tixcraft: "拓元售票",
        "era-ticket": "年代售票",
        kham: "寬宏售票",
        opentix: "兩廳院",
        kktix: "KKTIX",
      }}
      countLabel="場"
    />
  );
}
