// Keep the object URL alive long enough for browsers to consume large PDFs.
// The download is triggered directly, without an intermediate application modal.
export function downloadPdfFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 120000);
}
