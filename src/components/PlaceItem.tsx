import type { Place } from "@/types";

const TYPE_LABELS: Record<string, string> = {
  exhibition: "展覽",
  concert: "演唱會",
  music: "音樂會",
  theater: "戲劇",
  movie: "電影",
  food: "美食",
  attraction: "景點",
};

const TYPE_COLORS: Record<string, string> = {
  exhibition: "bg-purple-100 text-purple-700",
  concert: "bg-rose-100 text-rose-700",
  music: "bg-indigo-100 text-indigo-700",
  theater: "bg-fuchsia-100 text-fuchsia-700",
  movie: "bg-blue-100 text-blue-700",
  food: "bg-orange-100 text-orange-700",
  attraction: "bg-green-100 text-green-700",
};

interface PlaceItemProps {
  place: Place;
  isFavorite?: boolean;
  onToggleFavorite?: (place: Place) => void;
}

export default function PlaceItem({
  place,
  isFavorite,
  onToggleFavorite,
}: PlaceItemProps) {
  return (
    <div className="flex items-start gap-4 rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm border border-gray-100 dark:border-gray-800">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              TYPE_COLORS[place.type] ?? "bg-gray-100 text-gray-700"
            }`}
          >
            {TYPE_LABELS[place.type] ?? place.type}
          </span>
          <span className="text-xs text-gray-400">{place.source}</span>
        </div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50 line-clamp-2">
          {place.sourceUrl ? (
            <a
              href={place.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {place.name}
            </a>
          ) : (
            place.name
          )}
        </h3>
        <p className="text-sm text-gray-500 truncate">{place.address}</p>
        {place.startDate && (
          <p className="text-xs text-gray-400 mt-1">
            {place.startDate}
            {place.endDate ? ` ~ ${place.endDate}` : ""}
          </p>
        )}
      </div>
      {onToggleFavorite && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(place);
          }}
          aria-label={isFavorite ? "取消最愛" : "加入最愛"}
          className="shrink-0 p-1 text-xl transition-transform hover:scale-110"
        >
          {isFavorite ? "❤️" : "🤍"}
        </button>
      )}
    </div>
  );
}
