import BrowseList from "@/components/BrowseList";

export default function TheaterPage() {
  return (
    <BrowseList
      title="戲劇 / 舞台劇"
      apiType="theater"
      icon="🎭"
      iconBg="bg-fuchsia-100"
      sourceLabels={{
        "culture-theater": "文化部",
      }}
      countLabel="場"
    />
  );
}
