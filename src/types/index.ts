export interface Place {
  id: string;
  name: string;
  type: PlaceType;
  source: string;
  category: "indoor" | "outdoor" | "both";
  address: string;
  district: string;
  lat?: number;
  lng?: number;
  imageUrl?: string;
  sourceUrl?: string;
  startDate?: string;
  endDate?: string;
  goodFor: "date" | "solo" | "both";
  price?: string;
}

export type PlaceType =
  | "exhibition"
  | "concert"
  | "music"
  | "theater"
  | "movie"
  | "food"
  | "attraction";

export interface Itinerary {
  id: string;
  places: Place[];
}

export interface GenerateRequest {
  district?: string;
  type: ("all" | "exhibition" | "concert" | "music" | "theater" | "movie" | "attraction" | "food")[];
  setting: "indoor" | "outdoor" | "both";
  exclude?: string[];
  /** 使用者自己的口袋名單（存在各使用者的 Firestore），由 client 帶上來與共用 catalog 合併 */
  pocketList?: Place[];
}

export interface GenerateResponse {
  itineraries: Itinerary[];
}

export interface SyncResult {
  source: string;
  status: "success" | "error";
  count: number;
  error?: string;
}

export interface SyncResponse {
  results: SyncResult[];
}

// Raw data types from external sources
export interface CultureRawItem {
  UID: string;
  title: string;
  category: string;
  showInfo: {
    time: string;
    location: string;
    locationName: string;
    onSales: string;
    price: string;
    latitude: string | null;
    longitude: string | null;
    endTime: string;
  }[];
  showUnit: string;
  imageUrl: string;
  webSales: string;
  sourceWebPromote: string;
  startDate: string;
  endDate: string;
}
