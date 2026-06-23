import BrowseList from "@/components/BrowseList";

export default function ExhibitionsPage() {
  return (
    <BrowseList
      title="現正展覽"
      apiType="exhibition"
      icon="🎨"
      iconBg="bg-purple-100"
      sourceLabels={{
        culture: "文化部",
        huashan: "華山1914",
        songshan: "松山文創",
        twtc: "台北世貿",
        ntsec: "國立科教館",
      }}
      countLabel="檔展覽"
    />
  );
}
