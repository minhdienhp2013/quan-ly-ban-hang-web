export interface LabelPaperConfig {
  id: string;
  name: string;
  labelWidthMm: number;
  labelHeightMm: number;
  columns: number;
  gapHorizontalMm: number;
  gapVerticalMm: number;
  marginMm: number;
}

export const LABEL_PRESETS: LabelPaperConfig[] = [
  {
    id: '74x22-2',
    name: '74 × 22 mm · 2 nhãn/hàng',
    labelWidthMm: 74,
    labelHeightMm: 22,
    columns: 2,
    gapHorizontalMm: 2,
    gapVerticalMm: 2,
    marginMm: 0,
  },
  {
    id: '72x22-2',
    name: '72 × 22 mm · 2 nhãn/hàng',
    labelWidthMm: 72,
    labelHeightMm: 22,
    columns: 2,
    gapHorizontalMm: 2,
    gapVerticalMm: 2,
    marginMm: 0,
  },
  {
    id: '50x30-1',
    name: '50 × 30 mm · 1 nhãn/hàng',
    labelWidthMm: 50,
    labelHeightMm: 30,
    columns: 1,
    gapHorizontalMm: 0,
    gapVerticalMm: 2,
    marginMm: 0,
  },
];

export const DEFAULT_LABEL_CONFIG = LABEL_PRESETS[0];

export function validateLabelConfig(config: LabelPaperConfig): string[] {
  const errors: string[] = [];
  if (config.labelWidthMm <= 0) errors.push('Chiều rộng tem phải lớn hơn 0 mm.');
  if (config.labelHeightMm <= 0) errors.push('Chiều cao tem phải lớn hơn 0 mm.');
  if (!Number.isInteger(config.columns) || config.columns <= 0 || config.columns > 8) {
    errors.push('Số cột phải là số nguyên từ 1 đến 8.');
  }
  if (config.gapHorizontalMm < 0 || config.gapVerticalMm < 0) errors.push('Khoảng cách giữa tem không được âm.');
  if (config.marginMm < 0) errors.push('Lề giấy không được âm.');
  return errors;
}
