// Temporary diagnostic: reports elements that stick out past the viewport.
const f = document.getElementById('f');
setTimeout(() => {
  const d = f.contentDocument;
  const vw = d.documentElement.clientWidth;
  const lines = [
    'viewport=' + vw +
    '  documentScrollWidth=' + d.documentElement.scrollWidth +
    '  bodyScrollWidth=' + d.body.scrollWidth
  ];
  const hits = [];
  d.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (r.right > vw + 1 || r.left < -1) {
      let n = el, depth = 0;
      while (n.parentElement) { depth++; n = n.parentElement; }
      hits.push({
        depth,
        desc: el.tagName.toLowerCase() +
              (el.id ? '#' + el.id : '') +
              (typeof el.className === 'string' && el.className.trim()
                ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
        left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width)
      });
    }
  });
  hits.sort((a, b) => a.depth - b.depth);
  const seen = new Set();
  for (const h of hits) {
    const key = h.desc + '|' + h.width;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`  ${h.desc}  left=${h.left} right=${h.right} w=${h.width}`);
    if (seen.size >= 26) break;
  }
  if (hits.length === 0) lines.push('  (nothing overflows)');
  document.getElementById('out').textContent = lines.join('\n');
}, 1500);
