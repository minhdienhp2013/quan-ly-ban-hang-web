export function printLabels(): void {
  if (typeof window.print !== 'function') {
    throw new Error('Trình duyệt này không hỗ trợ hộp thoại in tiêu chuẩn.');
  }

  try {
    window.print();
  } catch {
    throw new Error('Không thể mở hộp thoại in. Hãy kiểm tra quyền của trình duyệt và thử lại.');
  }
}
