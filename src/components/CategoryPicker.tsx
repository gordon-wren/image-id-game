import type { PackCategory } from "../engine/categories";

interface CategoryPickerProps {
  categories: PackCategory[];
  onPick: (category: PackCategory) => void;
}

export function CategoryPicker({ categories, onPick }: CategoryPickerProps) {
  return (
    <div className="panel">
      {categories.map((category) => {
        const accent = category.packs[0]?.theme.accent;
        return (
          <button
            key={category.id}
            className="pack-card"
            style={accent ? { ["--accent" as string]: accent } : undefined}
            onClick={() => onPick(category)}
          >
            <div className="pack-card-row">
              <p className="pack-title">{category.title}</p>
              <span className="pack-hs">
                {category.packs.length} {category.packs.length === 1 ? "game" : "games"}
              </span>
            </div>
            {category.description && (
              <p className="pack-desc">{category.description}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
