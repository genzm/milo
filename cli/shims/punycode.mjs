// Hostname encoding uses the platform URL parser instead of punycode.js.
function toASCII(hostname) {
  try {
    return new URL(`http://${hostname}`).hostname;
  } catch {
    return hostname;
  }
}

export default { toASCII, toUnicode: (hostname) => hostname };
