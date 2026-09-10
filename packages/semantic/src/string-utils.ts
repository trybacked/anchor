export function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

export function titleize(value: string): string {
    return value
        .split("_")
        .filter((word) => word.length > 0)
        .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
        .join(" ");
}

export function titleCaseFromSlug(slug: string): string {
    return slug.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
