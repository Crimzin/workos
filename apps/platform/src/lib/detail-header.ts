interface DetailTrailNode {
  id: string;
  title: string;
  type: string;
}

interface DetailHeaderField {
  id: string;
  name: string;
  field_type: string;
  color: string;
  options: { id: string; name: string }[];
}

interface DetailHeaderValue {
  field_id: string;
  option_id: string | null;
}

export interface NodeIdentityTrailItem extends DetailTrailNode {
  href: string | null;
  isCurrent: boolean;
}

export interface HeaderFieldBadge {
  id: string;
  fieldId: string;
  fieldName: string;
  fieldType: "single_select" | "multi_select";
  optionId: string;
  name: string;
  color: string;
  selectedOptionIds: string[];
  options: { id: string; name: string }[];
}

export function buildBoardDetailTrail({
  ancestors,
  current,
}: {
  ancestors: DetailTrailNode[];
  current: DetailTrailNode;
  workspaceId: string;
}): NodeIdentityTrailItem[] {
  return [
    ...ancestors.map((ancestor) => ({
      ...ancestor,
      href:
        ancestor.type === "workspace"
          ? "/board"
          : `/board?d=${ancestor.id}`,
      isCurrent: false,
    })),
    {
      ...current,
      href: null,
      isCurrent: true,
    },
  ];
}

export function buildThreadIdentityTrail({
  path,
  current,
}: {
  path: DetailTrailNode[];
  current: DetailTrailNode;
}): NodeIdentityTrailItem[] {
  const source = path.length > 0 ? path : [current];

  return source.map((item, index) => {
    const isCurrent = item.id === current.id || index === source.length - 1;
    return {
      ...item,
      href: isCurrent ? null : `/n/${item.id}`,
      isCurrent,
    };
  });
}

export function getHeaderBadges(
  fields: DetailHeaderField[],
  values: DetailHeaderValue[]
): HeaderFieldBadge[] {
  const valuesByField = new Map<string, DetailHeaderValue[]>();
  for (const value of values) {
    const fieldValues = valuesByField.get(value.field_id) ?? [];
    fieldValues.push(value);
    valuesByField.set(value.field_id, fieldValues);
  }

  const badges: HeaderFieldBadge[] = [];
  for (const field of fields) {
    if (field.field_type !== "single_select" && field.field_type !== "multi_select") {
      continue;
    }
    const fieldValues = valuesByField.get(field.id) ?? [];
    const selectedOptionIds = fieldValues
      .map((value) => value.option_id)
      .filter((optionId): optionId is string => Boolean(optionId));
    for (const value of fieldValues) {
      if (!value.option_id) continue;
      const option = field.options.find((candidate) => candidate.id === value.option_id);
      if (option) {
        badges.push({
          id: `${field.id}:${option.id}`,
          fieldId: field.id,
          fieldName: field.name,
          fieldType: field.field_type,
          optionId: option.id,
          name: option.name,
          color: field.color,
          selectedOptionIds,
          options: field.options.map(({ id, name }) => ({ id, name })),
        });
      }
    }
  }

  return badges;
}
