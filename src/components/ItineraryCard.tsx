import type { Itinerary, Place } from "@/types";
import PlaceItem from "./PlaceItem";

interface ItineraryCardProps {
  itinerary: Itinerary;
  index: number;
  isFavorite?: (id: string) => boolean;
  onToggleFavorite?: (place: Place) => void;
}

export default function ItineraryCard({
  itinerary,
  index,
  isFavorite,
  onToggleFavorite,
}: ItineraryCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-5">
      <h2 className="mb-4 text-sm font-medium text-gray-500 dark:text-gray-400">
        行程 {index + 1}
      </h2>
      <div className="space-y-3">
        {itinerary.places.map((place, i) => (
          <div key={place.id} className="relative">
            {i < itinerary.places.length - 1 && (
              <div className="absolute left-6 top-16 h-3 w-px bg-gray-300 dark:bg-gray-700" />
            )}
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 dark:bg-gray-100 text-sm font-bold text-white dark:text-gray-900">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <PlaceItem
                  place={place}
                  isFavorite={isFavorite?.(place.id)}
                  onToggleFavorite={onToggleFavorite}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
