import BrowseList from "@/components/BrowseList";

export default function RestaurantsPage() {
  return (
    // 美食自 8a2a40d 起沒有共用來源（curated 已移除），只來自使用者的口袋名單，
    // 來源標籤走 PlaceItem 的共用 SOURCE_LABELS，這裡不需再宣告。
    <BrowseList
      title="美食"
      apiType="food"
      icon="🍽️"
      iconBg="bg-orange-100"
      countLabel="筆"
    />
  );
}
