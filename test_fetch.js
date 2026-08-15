const base = "https://hotcinema.co.il";
const endpoints = [
  "/tickets/TheaterEvents",
  "/tickets/TheaterEvents2",
  "/tickets/movieevents",
  "/MovieEventsDaysFilter"
];

function getKeysAndTypes(obj, maxDepth = 4, currentDepth = 0) {
  if (obj === null || obj === undefined) return typeof obj;
  if (typeof obj !== "object") return typeof obj;
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return [getKeysAndTypes(obj[0], maxDepth, currentDepth + 1)];
  }
  if (currentDepth >= maxDepth) return "{...}";
  const result = {};
  for (const k of Object.keys(obj)) {
    result[k] = getKeysAndTypes(obj[k], maxDepth, currentDepth + 1);
  }
  return result;
}

(async () => {
  for (const ep of endpoints) {
    try {
      const url = base + ep;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const data = await res.json();
      console.log("=== Endpoint:", ep, "===");
      console.log("Status:", res.status);
      console.log("Type:", Array.isArray(data) ? "Array" : "Object");
      if (Array.isArray(data)) {
        console.log("Length:", data.length);
        if (data.length > 0) {
          console.log("Sample keys:", Object.keys(data[0]));
          console.log("Sample structure:", JSON.stringify(getKeysAndTypes(data[0]), null, 2));
        }
      } else {
        console.log("Structure:", JSON.stringify(getKeysAndTypes(data), null, 2));
      }
    } catch (e) {
      console.log("Error for " + ep + ": " + e.message);
    }
  }
})();
