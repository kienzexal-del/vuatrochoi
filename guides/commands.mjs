document.querySelectorAll('[data-copy-command]').forEach(button => {
button.addEventListener('click', async () => {
const command = document.getElementById(button.dataset.copyCommand);
try { await navigator.clipboard.writeText(command.textContent); button.textContent = 'Đã sao chép'; document.getElementById('copy-status').textContent = 'Dán lệnh vào cửa sổ lệnh rồi nhấn Enter.'; setTimeout(() => button.textContent = 'Sao chép lệnh',2500); }
catch { const range = document.createRange(); range.selectNodeContents(command); const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(range); document.getElementById('copy-status').textContent='Đã chọn lệnh. Hãy sao chép thủ công.'; }
});
});
