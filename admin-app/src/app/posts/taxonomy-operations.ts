/**
 * Pure-function helpers that operate on raw Markdown post content
 * to rename or remove a taxonomy value (category / tag) inside
 * the YAML front-matter block.
 *
 * These intentionally work at the *string* level so they can be
 * composed with the existing fetch → mutate → save pipeline
 * without needing a full parse/serialize round-trip.
 */

type TaxonomyType = 'categories' | 'tags'

/**
 * Return the posts (from a full index) that contain a given taxonomy value.
 */
export function findPostsWithTaxonomy(
  posts: { path: string; categories: string[]; tags: string[] }[],
  type: TaxonomyType,
  name: string,
): string[] {
  return posts
    .filter((post) => post[type].includes(name))
    .map((post) => post.path)
}

/**
 * Replace every occurrence of `oldName` with `newName` inside the
 * YAML list for the given taxonomy field.
 *
 * Returns the full file content with the replacement applied.
 * If `oldName` is not found in the taxonomy list the content is
 * returned unchanged.
 */
export function renameTaxonomyInContent(
  content: string,
  type: TaxonomyType,
  oldName: string,
  newName: string,
): string {
  const frontmatterMatch = content.match(/^(---\n)([\s\S]*?\n)(---\n?)/)
  if (!frontmatterMatch) {
    return content
  }

  const before = frontmatterMatch[1]
  const frontmatter = frontmatterMatch[2]
  const after = frontmatterMatch[3]
  const rest = content.slice(frontmatterMatch[0].length)

  const updatedFrontmatter = replaceTaxonomyValue(frontmatter, type, oldName, newName)

  return `${before}${updatedFrontmatter}${after}${rest}`
}

/**
 * Remove `name` from the YAML list for the given taxonomy field.
 *
 * Returns the full file content with the entry removed.
 * If an empty list remains, the field is serialized as `categories:`
 * (no items) to keep the key present.
 */
export function deleteTaxonomyFromContent(
  content: string,
  type: TaxonomyType,
  name: string,
): string {
  const frontmatterMatch = content.match(/^(---\n)([\s\S]*?\n)(---\n?)/)
  if (!frontmatterMatch) {
    return content
  }

  const before = frontmatterMatch[1]
  const frontmatter = frontmatterMatch[2]
  const after = frontmatterMatch[3]
  const rest = content.slice(frontmatterMatch[0].length)

  const updatedFrontmatter = removeTaxonomyValue(frontmatter, type, name)

  return `${before}${updatedFrontmatter}${after}${rest}`
}

// ---------------------------------------------------------------------------
// Internal helpers

function replaceTaxonomyValue(
  frontmatter: string,
  type: TaxonomyType,
  oldName: string,
  newName: string,
): string {
  const lines = frontmatter.split('\n')
  const result: string[] = []
  let inTargetField = false

  for (const line of lines) {
    // Detect the start of a YAML field
    if (/^\S/.test(line)) {
      inTargetField = isFieldHeader(line, type)
    }

    if (inTargetField && isListItem(line)) {
      const itemValue = extractListItemValue(line)
      if (itemValue === oldName) {
        result.push(line.replace(oldName, newName))
        continue
      }
    }

    result.push(line)
  }

  return result.join('\n')
}

function removeTaxonomyValue(
  frontmatter: string,
  type: TaxonomyType,
  name: string,
): string {
  const lines = frontmatter.split('\n')
  const result: string[] = []
  let inTargetField = false

  for (const line of lines) {
    if (/^\S/.test(line)) {
      inTargetField = isFieldHeader(line, type)
    }

    if (inTargetField && isListItem(line)) {
      const itemValue = extractListItemValue(line)
      if (itemValue === name) {
        continue // skip this line entirely
      }
    }

    result.push(line)
  }

  return result.join('\n')
}

function isFieldHeader(line: string, type: TaxonomyType): boolean {
  return line.startsWith(`${type}:`)
}

function isListItem(line: string): boolean {
  return /^\s+-\s/.test(line)
}

function extractListItemValue(line: string): string {
  const match = line.match(/^\s*-\s*(.*)$/)
  if (!match) {
    return ''
  }

  return match[1].trim().replace(/^['"]|['"]$/g, '').trim()
}
