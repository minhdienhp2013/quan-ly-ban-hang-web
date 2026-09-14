export type SearchAliases = Readonly<Record<string, string>>;

export interface SearchForms {
  normalized: string;
  compact: string;
  expanded: string;
  expandedCompact: string;
  tokens: string[];
}

const NAME_SEPARATOR_PATTERN = /[\s\-_.\/\\]+/g;
const COMBINING_MARKS_PATTERN = /[\u0300-\u036f]/g;
const NUMBER_C_PATTERN = /^(\d+)c$/;
const NUMBER_C_COMPACT_PATTERN = /(\d+)c(?!anh)(?=[a-z]|$)/g;

function removeVietnameseDiacritics(value: string) {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS_PATTERN, '')
    .replace(/[đĐ]/g, 'd');
}

function normalizeBase(value: string) {
  return removeVietnameseDiacritics(value)
    .toLocaleLowerCase('vi')
    .trim();
}

function normalizeNameSeparators(value: string) {
  return value
    .replace(NAME_SEPARATOR_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildAliasMap(aliases?: SearchAliases) {
  const normalized = new Map<string, string>();
  for (const [rawKey, rawValue] of Object.entries(aliases ?? {})) {
    const key = normalizeNameSeparators(normalizeBase(rawKey));
    const value = normalizeNameSeparators(normalizeBase(rawValue));
    if (key && value) normalized.set(key, value);
  }
  return normalized;
}

function expandToken(token: string, aliases: Map<string, string>) {
  const configured = aliases.get(token);
  if (configured) return configured;

  const numberC = NUMBER_C_PATTERN.exec(token);
  if (numberC) return `${numberC[1]} canh`;

  return token;
}

export function normalizeSearchText(value: string, aliases?: SearchAliases): SearchForms {
  const normalized = normalizeNameSeparators(normalizeBase(value));
  const compact = normalized.replace(/\s+/g, '');
  const aliasMap = buildAliasMap(aliases);
  const expanded = normalized
    .split(' ')
    .filter(Boolean)
    .map((token) => expandToken(token, aliasMap))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  let expandedCompact = expanded.replace(/\s+/g, '');
  expandedCompact = expandedCompact.replace(NUMBER_C_COMPACT_PATTERN, '$1canh');

  return {
    normalized,
    compact,
    expanded,
    expandedCompact,
    tokens: expanded.split(' ').filter(Boolean),
  };
}

export function normalizeSearchCode(value: string | undefined) {
  return value?.trim().toLocaleLowerCase('vi') ?? '';
}
