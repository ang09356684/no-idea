import BrowseList from "@/components/BrowseList";

export default function AttractionsPage() {
  return (
    <BrowseList
      title="景點"
      apiType="attraction"
      icon="🏞️"
      iconBg="bg-green-100"
      sourceLabels={{
        "taipei-attraction": "台北景點",
        taoyuan: "桃園觀光",
      }}
      countLabel="個景點"
    />
  );
}
